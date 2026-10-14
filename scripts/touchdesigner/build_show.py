# build_show.py - builds Resonance's TouchDesigner show patch (/project1/show).
#
# Runs INSIDE TouchDesigner (2025.x). ResonanceShow.toe carries this file as the
# Text DAT /project1/build_show and calls build() from its boot Execute DAT on
# first start, then saves itself, so later launches open the finished patch.
# Re-run by hand from the Textport:
#     op('/project1/build_show').module.build(op('/project1'), op('/project1/looks'), op('/project1/rehearsal_log'))
#
# The network (all inside /project1/show):
#
#   osc_in   OSC In CHOP  :7000  continuous /resonance/* channels
#   osc_dat  OSC In DAT   :7000  strings + events (journey id, phase, onsets)
#   osc_cb   callbacks for osc_dat -> brain's event queue
#   brain    Execute DAT, every frame: normalises the channels, picks the
#            journey's LOOK (looks.json: one per journey, derived from its
#            stills palette + deep analysis), eases between looks with a
#            smoothstep crossfade, turns music into MOTION (speed, turbulence,
#            emission, size), plays the rehearsal log, writes `raw`
#   raw      Constant CHOP (the brain's output, one channel per control)
#   ease     Lag CHOP      (0.15 s up / 0.6 s down: nothing jumps)
#   calm     Filter CHOP   (gaussian 0.3 s: nothing flickers)
#   ctl      Null CHOP     <- every shader uniform reads from here
#   seed -> sim_fb -> sim  GLSL TOP particle simulation (RGBA32F: xyz + life)
#   pcol     GLSL TOP particle colour (palette, life fade, presence)
#   sprite   GLSL TOP soft round sprite
#   geo/cam/render         instanced point sprites (one instance per sim texel)
#   trail_fb -> trail      feedback trails (advected, max-blend: bounded)
#   safe_fb -> safe        seizure guard: background, luminance cap, red
#                          guard, per-pixel slew limit (no frame can flash)
#   out      Null TOP  (perform window + recorder read this)
#   window   Window COMP (fullscreen projector output)
#   osc_out  OSC Out DAT -> 127.0.0.1:7000 (rehearsal playback)
#   rec      Movie File Out TOP (self-test capture)
#
# Seizure law (docs/flicker-safety.md): the music moves things, it never
# switches light. Audio drives speed / turbulence / emission / size; overall
# brightness is a fixed master (<= 0.9) with no audio term; every control is
# lagged + filtered; the output is luminance-capped and slew-limited per pixel.
# No strobe, no full-field flash, no saturated red.
#
# Pure-Python parts (BRAIN_CORE) are exercised offline by
# scripts/touchdesigner/test_show.py (mock TD + replay of a recorded OSC log).

import json

VERSION = '2026.10.13'

# ---------------------------------------------------------------------------
# Output channels (order = Constant CHOP slots)
# ---------------------------------------------------------------------------
OUT_CHANNELS = (
    ['speed', 'turb', 'emit', 'breath', 'size', 'trail', 'zoom', 'swirl', 'presence',
     'sparkle', 'master', 'xf', 'onset', 'bass', 'level', 'tension', 'warmth']
    + ['form%d' % i for i in range(5)]
    + ['pal%d%s' % (i, c) for i in range(5) for c in 'rgb']
)

# ---------------------------------------------------------------------------
# BRAIN_CORE - pure Python (no td). Also exec'd by the offline test harness.
# ---------------------------------------------------------------------------
BRAIN_CORE = r'''
import json, math

def norm_name(name):
    """OSC In CHOP channel name -> 'audio/bass' (handles /, _ and the prefix)."""
    n = str(name).strip().lstrip('/')
    n = n.replace(':', '/')
    if n.startswith('resonance/') or n.startswith('resonance_'):
        n = n[10:]
    return n.replace('_', '/')

def clamp(v, a, b):
    return a if v < a else b if v > b else v

def smoothstep(a, b, x):
    if b <= a:
        return 1.0
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def safe_palette(cols):
    """5 stops dark->light; no saturated red; brightest stop <= 0.85 luminance."""
    cols = [list(c) for c in cols if c is not None][:5] or [[0.05, 0.06, 0.09], [0.2, 0.25, 0.35], [0.55, 0.6, 0.7], [0.85, 0.75, 0.55], [0.95, 0.9, 0.8]]
    while len(cols) < 5:
        cols.append(list(cols[-1]))
    cols.sort(key=lum)
    out = []
    for r, g, b in cols:
        s = (r + g + b) or 1.0
        if r / s >= 0.7 and r > 0.5:
            g = max(g, r * 0.35); b = max(b, r * 0.2)
        L = lum((r, g, b))
        k = 0.85 / L if L > 0.85 else 1.0
        out.append([r * k, g * k, b * k])
    return out

DEFAULT_LOOK = {
    'name': 'default', 'activity': 0.5, 'energy': 0.5, 'dynamics': 0.4, 'form': 0,
    'speed': 0.5, 'turbulence': 0.5, 'emission': 0.55, 'size': 0.95, 'trail': 0.94,
    'warmth': 0.5, 'sparkle': 0.4, 'palette': None, 'phases': None,
}

LOOK_KEYS = ('speed', 'turbulence', 'emission', 'size', 'trail', 'warmth', 'sparkle')

class Player:
    """Rehearsal: replays a recorded OSC log (JSONL {"t": s, "a": address, "v": [args]})."""
    def __init__(self, text):
        self.rows = []
        for line in (text or '').splitlines():
            line = line.strip()
            if not line or line[0] != '{':
                continue
            try:
                r = json.loads(line)
                v = list(r.get('v', []))
                y = str(r.get('y', ''))
                if len(y) == len(v):   # keep the recorded OSC types (f stays float, i stays int)
                    v = [float(x) if t == 'f' else int(x) if t == 'i' else str(x) if t == 's' else x for x, t in zip(v, y)]
                self.rows.append((float(r['t']), str(r['a']), v))
            except Exception:
                pass
        self.rows.sort(key=lambda r: r[0])
        self.length = (self.rows[-1][0] + 0.5) if self.rows else 0.0
        self.i = 0
        self.t0 = None
        self.loops = 0

    def due(self, now):
        """Messages due at wall time `now` (seconds); loops at the end."""
        if not self.rows:
            return []
        if self.t0 is None:
            self.t0 = now
        el = now - self.t0
        if el >= self.length:
            self.t0 = now; self.i = 0; self.loops += 1; el = 0.0
        out = []
        while self.i < len(self.rows) and self.rows[self.i][0] <= el:
            out.append(self.rows[self.i][1:])
            self.i += 1
        return out

class Brain:
    def __init__(self, looks_text):
        try:
            data = json.loads(looks_text or '{}')
        except Exception:
            data = {}
        self.looks = data.get('looks', data) if isinstance(data, dict) else {}
        self.by_name = {}
        for k, v in self.looks.items():
            nm = str(v.get('name', '')).strip().lower()
            if nm and nm not in self.by_name:
                self.by_name[nm] = k
        self.jid = ''
        self.jname = ''
        self.phase_idx = 0
        self.look_key = None       # id of the look in use ('' = palette default)
        self.cur = None            # current blended control values
        self.frm = None            # values at the start of the running crossfade
        self.tgt = None
        self.xf_t0 = -1e9
        self.xf_len = 1.0
        self.xf_journey = False
        self.env = {'onset': 0.0, 'section': 0.0, 'phrase': 0.0, 'cadence': 0.0, 'beat': 0.0}
        self.hits = {}
        self.presence = 0.0
        self.switches = []         # (t, key) log - the self-test reports it
        self.t = 0.0

    # ---- events (from the OSC In DAT, or the CHOP's pulse channels) ----
    def on_osc(self, address, args):
        a = str(address)
        if a.startswith('/resonance/'):
            a = a[10:]
        if a in ('/event/journey', '/journey/id'):
            jid = str(args[0]).strip() if args else ''
            if jid:                       # empty between journeys: keep the look
                if a == '/event/journey' and len(args) > 1 and str(args[1]).strip():
                    self.jname = str(args[1])
                elif a == '/event/journey':
                    self.jname = ''
                if jid != self.jid and a == '/journey/id':
                    self.jname = ''       # a new id without its event: don't keep the old name
                self.jid = jid
        elif a == '/journey/name' and args and str(args[0]).strip():
            self.jname = str(args[0])
        elif a == '/event/phase' and len(args) > 1:
            try:
                self.phase_idx = int(args[1])
            except Exception:
                pass
        elif a == '/audio/onset' and args:
            self.hit('onset', float(args[0]))
        elif a == '/phrase/event' and args:
            kind = str(args[0])
            s = float(args[2]) if len(args) > 2 else 0.6
            self.hit('section' if kind == 'section' else 'phrase', s)
        elif a == '/phrase/cadence':
            self.hit('cadence', float(args[0]) if args else 0.6)
        elif a == '/clock/tick':
            self.hit('beat', 0.5)

    def hit(self, kind, strength):
        self.hits[kind] = max(self.hits.get(kind, 0.0), clamp(float(strength), 0.0, 1.0))

    # ---- looks ----
    def resolve(self):
        if self.jid and self.jid in self.looks:
            return self.jid
        nm = (self.jname or '').strip().lower()
        if nm and nm in self.by_name:
            return self.by_name[nm]
        return ''

    def live_palette(self, ch):
        n = int(ch.get('palette/count', 0) or 0)
        if n <= 0:
            return None
        cols = []
        for i in range(5):
            r = ch.get('palette/%d/r' % i); g = ch.get('palette/%d/g' % i); b = ch.get('palette/%d/b' % i)
            if r is None or g is None or b is None:
                continue
            cols.append([r, g, b])
        return cols or None

    def target(self, key, ch):
        look = self.looks.get(key) if key else None
        base = dict(DEFAULT_LOOK)
        if look:
            base.update({k: look[k] for k in LOOK_KEYS + ('form',) if k in look})
        pal = None
        if look:
            ph = look.get('phases') or []
            if ph:
                pal = ph[int(clamp(self.phase_idx, 0, len(ph) - 1))]
            pal = pal or look.get('palette')
        if pal is None:
            pal = self.live_palette(ch)   # fallback: the journey's live phase palette
        pal = safe_palette(pal or [])
        v = {k: float(base[k]) for k in LOOK_KEYS}
        form = int(base.get('form', 0))
        if not look:
            # palette-derived default: a calm drift/orbit blend, colours from the show
            for i in range(5):
                v['form%d' % i] = (0.6 if i == 0 else 0.4 if i == 4 else 0.0)
        else:
            for i in range(5):
                v['form%d' % i] = 1.0 if i == form else 0.0
        for i, c in enumerate(pal):
            for j, cc in enumerate('rgb'):
                v['pal%d%s' % (i, cc)] = float(c[j])
        return v

    # ---- per frame ----
    def step(self, t, dt, ch, xfade=8.0, phase_xfade=6.0, master=0.85):
        """t, dt in seconds; ch = {normalised channel: value}. Returns {OUT channel: value}."""
        self.t = t
        dt = clamp(dt if dt > 0 else 1.0 / 60, 1.0 / 240, 0.1)
        g = ch.get
        # phase index also arrives as a continuous channel
        pi = g('journey/phase/index')
        if pi is not None and int(pi) != self.phase_idx and pi >= 0:
            self.phase_idx = int(pi)
        # pulses from the CHOP (held ~1 relay frame) count as hits too
        for k, nm in (('onset', 'pulse/onset'), ('section', 'pulse/section'), ('phrase', 'pulse/phrase'),
                      ('cadence', 'pulse/cadence'), ('beat', 'pulse/beat')):
            v = g(nm)
            if v:
                self.hit(k, v)
        # envelopes: instant peak, exponential decay (the Lag CHOP softens the attack)
        decays = {'onset': 1.2, 'section': 4.0, 'phrase': 3.0, 'cadence': 3.5, 'beat': 0.35}
        for k, tau in decays.items():
            e = self.env[k] * math.exp(-dt / tau)
            self.env[k] = max(e, self.hits.get(k, 0.0))
        self.hits = {}

        key = self.resolve()
        tgt = self.target(key, ch)
        if self.cur is None:
            self.cur = dict(tgt); self.frm = dict(tgt); self.tgt = dict(tgt)
            self.look_key = key; self.xf_t0 = t - 1e3
            self.switches.append((round(t, 2), key or '(palette default)'))
        journey_change = key != self.look_key
        if journey_change or any(abs(tgt[k] - self.tgt.get(k, tgt[k])) > 1e-4 for k in tgt):
            # start a new crossfade FROM where we are now (no jumps, ever)
            still_journey = self.xf_journey and (t - self.xf_t0) < self.xf_len
            self.frm = dict(self.cur)
            self.tgt = dict(tgt)
            self.xf_t0 = t
            self.xf_journey = journey_change or still_journey
            self.xf_len = max(0.5, xfade if self.xf_journey else phase_xfade)
            if journey_change:
                self.look_key = key
                self.switches.append((round(t, 2), key or '(palette default)'))
        w = smoothstep(0.0, self.xf_len, t - self.xf_t0)
        self.cur = {k: self.frm.get(k, self.tgt[k]) + (self.tgt[k] - self.frm.get(k, self.tgt[k])) * w for k in self.tgt}
        xf = math.sin(math.pi * w) if (self.xf_journey and w < 1.0) else 0.0
        if w >= 1.0:
            self.xf_journey = False

        # music -> motion (never brightness)
        level = clamp(g('audio/level', 0.0) or 0.0, 0, 1)
        bass = clamp(g('audio/bass', 0.0) or 0.0, 0, 1)
        mid = clamp(g('audio/mid', 0.0) or 0.0, 0, 1)
        treble = clamp(g('audio/treble', 0.0) or 0.0, 0, 1)
        tension = clamp(g('harmony/tension', 0.3) or 0.0, 0, 1)
        breath = clamp((g('breath/phase', 0.0) or 0.0) * (g('breath/amount', 0.0) or 0.0), -1, 1)
        jprog = clamp(g('journey/progress', 0.5) if g('journey/progress') is not None else 0.5, 0, 1)
        silent = (g('audio/silent', 0) or 0) >= 0.5
        holding = (g('presenter/holding', 0) or 0) >= 0.5
        playing = g('presenter/playing')
        quiet = silent or holding or (playing is not None and playing < 0.5)
        target_presence = 0.25 if quiet else 1.0
        self.presence += (target_presence - self.presence) * (1 - math.exp(-dt / 2.0))
        on = self.env['onset']; sec = self.env['section']; phr = self.env['phrase']; cad = self.env['cadence']
        c = self.cur
        out = {}
        out['speed'] = c['speed'] * (0.6 + 0.45 * level + 0.25 * bass + 0.3 * on + 0.15 * phr) * (0.8 + 0.2 * self.presence)
        out['turb'] = c['turbulence'] * (0.7 + 0.6 * tension) + 0.2 * on + 0.1 * treble
        arc = 0.6 + 0.4 * jprog                       # sparse -> build -> cosmic
        out['emit'] = clamp(c['emission'] * arc * (1 + 0.5 * on + 0.3 * sec) * (1 - 0.35 * xf), 0.04, 0.92) * self.presence
        out['breath'] = breath
        out['size'] = c['size'] * (1 + 0.2 * bass + 0.1 * cad)
        out['trail'] = clamp(c['trail'] + 0.02 * xf + 0.01 * cad, 0.85, 0.985)
        out['zoom'] = 0.0015 + 0.002 * mid + 0.0015 * xf
        out['swirl'] = 0.0006 * (1 if c['form2'] > 0.5 else 0.4) + 0.0008 * on
        out['presence'] = self.presence
        out['sparkle'] = c['sparkle']
        out['master'] = clamp(float(master), 0.3, 0.9)  # fixed: no audio term, ever
        out['xf'] = xf
        out['onset'] = on
        out['bass'] = bass
        out['level'] = level
        out['tension'] = tension
        out['warmth'] = c['warmth']
        for i in range(5):
            out['form%d' % i] = c['form%d' % i]
        for i in range(5):
            for cc in 'rgb':
                out['pal%d%s' % (i, cc)] = c['pal%d%s' % (i, cc)]
        return out
'''

# ---------------------------------------------------------------------------
# BRAIN_GLUE - the TD side of the brain Execute DAT.
# ---------------------------------------------------------------------------
BRAIN_GLUE = r'''

# ======================= TouchDesigner glue =======================
OUT_CHANNELS = %(channels)r

_S = {}   # module globals (not op storage: storage is pickled into the .toe)

def _state():
    st = _S
    show = parent()
    if 'brain' not in st:
        looks = show.par.Looks.eval()
        st['brain'] = Brain(looks.text if looks is not None else '{}')
    log = show.par.Rehearsallog.eval()
    src = log.path if log is not None else ''
    if st.get('player_src') != src or 'player' not in st:
        st['player'] = Player(log.text if log is not None else '')
        st['player_src'] = src
    return st

def reset():
    _S.clear()

def queue_osc(address, args):
    st = _S
    q = st.get('queue')
    if q is None:
        q = st['queue'] = []
    if len(q) < 512:
        q.append((address, list(args)))

def onFrameStart(frame):
    show = parent()
    st = _state()
    B = st['brain']
    t = absTime.seconds
    dt = absTime.stepSeconds or (1.0 / 60)
    if show.par.Rehearsal.eval():
        out = op('osc_out')
        due = st['player'].due(t)
        for i in range(0, len(due), 48):   # one bundle per <= 48 messages, like the relay
            flat = []
            for a, v in due[i:i + 48]:
                flat += [a, v]
            try:
                out.sendOSC(*flat, asBundle=True, useNonStandardTypes=False)
            except Exception:
                for a, v in due[i:i + 48]:
                    try:
                        out.sendOSC(a, v, useNonStandardTypes=False)
                    except Exception:
                        pass
    q = st.get('queue') or []
    st['queue'] = []
    for a, v in q:
        B.on_osc(a, v)
    ch = {}
    src = op('osc_in')
    if src is not None:
        for c in src.chans():
            ch[norm_name(c.name)] = c.eval()
    vals = B.step(t, dt, ch, xfade=show.par.Xfade.eval(), phase_xfade=show.par.Phasexfade.eval(),
                  master=show.par.Master.eval())
    raw = op('raw')
    for i, k in enumerate(OUT_CHANNELS):
        getattr(raw.par, 'const%%dvalue' %% i).val = vals[k]
    show.store('look', B.look_key or '(palette default)')
    show.store('journey', B.jname or B.jid)
    return

def onStart():
    reset()
    return
'''

OSC_CB = r'''
# osc_dat callbacks: every string/event message goes to the brain's queue.
def onReceiveOSC(dat, rowIndex, message, *rest):
    address, args = None, []
    for r in rest:
        if isinstance(r, str) and r.startswith('/') and address is None:
            address = r
        elif isinstance(r, (list, tuple)):
            args = list(r)
    if address is None:
        parts = str(message).split()
        if not parts:
            return
        address = parts[0]
        args = []
        for p in parts[1:]:
            p = p.strip('"')
            try:
                args.append(float(p) if '.' in p else int(p))
            except ValueError:
                args.append(p)
    op('brain').module.queue_osc(address, args)
    return
'''

# ---------------------------------------------------------------------------
# Shaders (GLSL 4.x, TD pixel-shader conventions)
# ---------------------------------------------------------------------------
SIM_GLSL = r'''// sim: one texel = one particle. rgb = position, a = life (s, <= 0 dead)
uniform vec4 uA;   // x time, y dt, z speed, w turbulence
uniform vec4 uB;   // x emission, y breath, z presence, w onset
uniform vec4 uF;   // form weights 0..3 (drift, rise, vortex, fall)
uniform vec4 uG;   // x form4 (orbit), y size, z bass, w sparkle
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hash3(vec2 p) {
    return vec3(hash(p), hash(p + 17.31), hash(p + 41.73));
}
vec3 pot(vec3 p, float t) {
    return vec3(sin(p.y * 1.3 + t * 0.31) + 0.6 * sin(p.z * 0.7 - t * 0.23) + 0.3 * sin(p.x * 2.1 + t * 0.17),
                sin(p.z * 1.1 - t * 0.27) + 0.6 * sin(p.x * 0.9 + t * 0.19) + 0.3 * sin(p.y * 2.3 - t * 0.13),
                sin(p.x * 1.2 + t * 0.21) + 0.6 * sin(p.y * 0.8 - t * 0.33) + 0.3 * sin(p.z * 1.9 + t * 0.11));
}
vec3 curl(vec3 p, float t) {
    const float e = 0.06;
    vec3 dx = vec3(e, 0, 0), dy = vec3(0, e, 0), dz = vec3(0, 0, e);
    vec3 px0 = pot(p - dx, t), px1 = pot(p + dx, t);
    vec3 py0 = pot(p - dy, t), py1 = pot(p + dy, t);
    vec3 pz0 = pot(p - dz, t), pz1 = pot(p + dz, t);
    return vec3((py1.z - py0.z) - (pz1.y - pz0.y),
                (pz1.x - pz0.x) - (px1.z - px0.z),
                (px1.y - px0.y) - (py1.x - py0.x)) / (2.0 * e);
}
vec3 spawn(vec2 id, float t) {
    vec3 h = hash3(id * 3.7 + fract(t * 0.0137));
    float pick = hash(id * 9.1 + fract(t * 0.071));
    float w0 = uF.x, w1 = uF.y, w2 = uF.z, w3 = uF.w, w4 = uG.x;
    float tot = max(w0 + w1 + w2 + w3 + w4, 1e-3);
    pick *= tot;
    float ang = h.x * 6.2831853;
    if (pick < w0) return vec3(h.x * 4.8 - 2.4, h.y * 2.8 - 1.4, h.z * 2.0 - 1.0);
    pick -= w0;
    if (pick < w1) return vec3(h.x * 4.8 - 2.4, -1.7, h.z * 2.0 - 1.0);
    pick -= w1;
    if (pick < w2) { float r = 0.3 + 1.3 * h.y; return vec3(cos(ang) * r, sin(ang) * r, h.z - 0.5); }
    pick -= w2;
    if (pick < w3) return vec3(h.x * 4.8 - 2.4, 1.7, h.z * 2.0 - 1.0);
    float r = 0.6 + 1.2 * h.y;
    return vec3(cos(ang) * r, (h.z - 0.5) * 0.8, sin(ang) * r);
}
vec3 flow(vec3 p, float t) {
    vec3 v = curl(p * 0.8, t * 0.5) * 0.18 * uA.w;
    float r2 = max(length(p.xy), 0.3);
    v += uF.x * vec3(0.12, 0.03, 0.0);
    v += uF.y * vec3(0.0, 0.32, 0.0);
    v += uF.z * (vec3(-p.y, p.x, 0.0) / r2 * 0.55 + vec3(p.xy, 0.0) * 0.12 * uB.y);
    v += uF.w * vec3(0.06 * sin(t * 0.4 + p.y * 2.0), -0.22, 0.0);
    v += uG.x * (normalize(cross(vec3(0.0, 1.0, 0.0), p + vec3(1e-3))) * 0.45 + vec3(0.0, -p.y * 0.2, 0.0));
    v += p * 0.04 * uB.y;  // the whole field inhales / exhales with the phrase
    return v * uA.z;
}
void main() {
    vec2 id = vUV.st;
    vec4 s = texture(sTD2DInputs[0], id);
    vec3 p = s.xyz;
    float life = s.a;
    float t = uA.x;
    float dt = clamp(uA.y, 0.0, 0.05);
    float lmax = 4.0 + 5.0 * hash(id * 13.3);
    if (life > 0.0) {
        p += flow(p, t) * dt;
        life -= dt;
        if (length(p) > 3.6) { life = 0.0; p = vec3(0.0, 0.0, 60.0); }
    } else {
        float e = clamp(uB.x, 0.0, 0.92);
        float k = e / max((1.0 - e) * 6.5, 0.05);       // respawn rate -> alive share = e
        if (hash(id * 7.77 + fract(t * 0.317)) < k * dt) {
            p = spawn(id, t);
            life = lmax;
        } else {
            life = -1.0;
            p = vec3(0.0, 0.0, 60.0);   // parked behind the camera: a dead mote can never draw
        }
    }
    fragColor = vec4(p, life);
}
'''

PCOL_GLSL = r'''// pcol: per-particle colour (rgba) for instancing
uniform vec4 uP0; uniform vec4 uP1; uniform vec4 uP2; uniform vec4 uP3; uniform vec4 uP4;
uniform vec4 uW;   // x warmth, y sparkle, z presence, w time
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 pal(float q) {
    // q in 0..1 over stops 1..4 (stop 0 is the ground)
    float x = clamp(q, 0.0, 1.0) * 3.0;
    if (x < 1.0) return mix(uP1.rgb, uP2.rgb, x);
    if (x < 2.0) return mix(uP2.rgb, uP3.rgb, x - 1.0);
    return mix(uP3.rgb, uP4.rgb, x - 2.0);
}
void main() {
    vec2 id = vUV.st;
    vec4 s = texture(sTD2DInputs[0], id);
    float life = s.a;
    float lmax = 4.0 + 5.0 * hash(id * 13.3);
    float age = lmax - life;
    float a = life > 0.0 ? smoothstep(0.0, 0.9, age) * smoothstep(0.0, 1.6, life) : 0.0;
    float h = hash(id * 5.31);
    float q = mix(h, 0.55 + 0.45 * h, uW.x * 0.5);
    vec3 c = pal(q);
    // sparkle = finer, slightly brighter grain on a share of motes (static per mote: no twinkle)
    float grain = step(1.0 - 0.25 * uW.y, hash(id * 2.13));
    c *= 0.85 + 0.25 * grain;
    a *= (0.45 + 0.4 * hash(id * 8.9)) * uW.z;
    fragColor = vec4(c * a, a);
}
'''

SPRITE_GLSL = r'''// sprite: soft round mote (gaussian), premultiplied
out vec4 fragColor;
void main() {
    vec2 d = vUV.st - 0.5;
    float r = length(d) * 2.0;
    float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
    fragColor = vec4(vec3(a), a);
}
'''

TRAIL_GLSL = r'''// trail: advected feedback, max-blend (bounded: never accumulates past the source)
uniform vec4 uT;   // x decay per 60 fps frame, y zoom, z swirl, w dt
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    vec2 c = uv - 0.5;
    float k = uT.w * 60.0;
    float ang = uT.z * k;
    c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c * (1.0 - uT.y * k);
    vec2 puv = c + 0.5;
    vec2 px = 1.0 / vec2(textureSize(sTD2DInputs[1], 0));
    vec4 prev = 0.25 * (texture(sTD2DInputs[1], puv + vec2(px.x, 0.0)) + texture(sTD2DInputs[1], puv - vec2(px.x, 0.0))
                      + texture(sTD2DInputs[1], puv + vec2(0.0, px.y)) + texture(sTD2DInputs[1], puv - vec2(0.0, px.y)));
    float decay = pow(clamp(uT.x, 0.0, 0.99), k);
    vec4 cur = texture(sTD2DInputs[0], uv);
    fragColor = max(prev * decay, cur);
}
'''

SAFE_GLSL = r'''// safe: ground + master + luminance cap + red guard + per-pixel slew limit
uniform vec4 uS;   // x master, y max change per second, z dt, w luminance cap
uniform vec4 uP0; uniform vec4 uP1;
uniform vec4 uV;   // x presence, y breath, z time
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    vec2 d = (uv - 0.5) * vec2(1.6, 1.0);
    float r = length(d);
    // ground: the palette's two darkest stops, very low, breathing slowly in SIZE not level
    float glow = exp(-r * r * (2.2 - 0.25 * uV.y));
    vec3 ground = mix(uP0.rgb * 0.18, uP1.rgb * 0.22, glow) * (0.6 + 0.4 * uV.x);
    vec3 c = ground + texture(sTD2DInputs[0], uv).rgb * uS.x;
    // soft-knee luminance cap
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float cap = uS.w;
    if (L > cap * 0.8) {
        float Ln = cap * 0.8 + (cap * 0.2) * (1.0 - exp(-(L - cap * 0.8) / (cap * 0.2)));
        c *= Ln / max(L, 1e-5);
    }
    // red guard: no saturated red, ever
    float s = c.r + c.g + c.b + 1e-5;
    if (c.r / s > 0.7) { c.g = max(c.g, c.r * 0.35); c.b = max(c.b, c.r * 0.2); }
    // slew limit against the last output frame: no pixel can flash
    vec3 prev = texture(sTD2DInputs[1], uv).rgb;
    float stepMax = uS.y * clamp(uS.z, 0.0, 0.1);
    c = prev + clamp(c - prev, -stepMax, stepMax);
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
'''

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
_REPORT = None

def _warn(msg):
    if _REPORT is not None:
        _REPORT['warnings'].append(msg)
    print('[build_show]', msg)

def setp(o, name, value=None, expr=None):
    """Set a parameter defensively: a wrong name/menu value is logged, never fatal."""
    try:
        p = getattr(o.par, name)
    except Exception:
        p = None
    if p is None:
        _warn('%s: no parameter %s' % (o.path, name))
        return False
    try:
        if expr is not None:
            p.expr = expr
            p.mode = ParMode.EXPRESSION
        else:
            p.val = value
        return True
    except Exception as e:
        _warn('%s.%s = %r failed: %s' % (o.path, name, expr if expr is not None else value, e))
        return False

def mk(parent_op, optype, name, x, y, **pars):
    o = parent_op.op(name)
    if o is not None:
        o.destroy()
    o = parent_op.create(optype, name)
    o.nodeX, o.nodeY = x, y
    for k, v in pars.items():
        if isinstance(v, Expr):
            setp(o, k, expr=v.s)
        else:
            setp(o, k, v)
    return o

class Expr(object):
    def __init__(self, s):
        self.s = s

def wire(src, dst, index=0):
    try:
        dst.inputConnectors[index].connect(src)
    except Exception as e:
        _warn('wire %s -> %s[%d] failed: %s' % (src.path, dst.path, index, e))

def text_dat(parent_op, name, x, y, text, kind=None):
    d = mk(parent_op, textDAT, name, x, y)
    d.text = text
    if kind:
        setp(d, 'language', kind)
    return d

def uniforms(glsl, vecs):
    """vecs: [(name, [x, y, z, w] expressions)] -> GLSL TOP vector uniforms."""
    try:
        glsl.seq.vec.numBlocks = len(vecs)
    except Exception as e:
        _warn('%s: vec sequence: %s' % (glsl.path, e))
    for i, (nm, comps) in enumerate(vecs):
        setp(glsl, 'vec%dname' % i, nm)
        for c, e in zip('xyzw', comps):
            setp(glsl, 'vec%dvalue%s' % (i, c), expr=str(e))

def glsl_top(parent_op, name, x, y, src, res, fmt='rgba16float'):
    pix = text_dat(parent_op, name + '_pixel', x, y - 160, src)
    g = mk(parent_op, glslTOP, name, x, y)
    setp(g, 'pixeldat', pix.name)
    setp(g, 'outputresolution', 'custom')
    setp(g, 'resolutionw', expr=res[0])
    setp(g, 'resolutionh', expr=res[1])
    setp(g, 'format', fmt)
    return g

C = lambda ch: "op('ctl')['%s']" % ch

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
def build(root, looks_dat=None, log_dat=None, name='show'):
    """Build (or rebuild) root/<name>. Returns a report dict."""
    global _REPORT
    _REPORT = {'version': VERSION, 'warnings': [], 'ops': 0}
    old = root.op(name)
    if old is not None:
        old.destroy()
    show = root.create(containerCOMP, name)
    show.nodeX, show.nodeY = 0, 0
    setp(show, 'w', 1280); setp(show, 'h', 720)

    # ---- custom parameters (the show's control surface) ----
    pg = show.appendCustomPage('Show')
    pg.appendToggle('Rehearsal', label='Rehearsal (play recorded OSC log)')
    pg.appendFloat('Xfade', label='Journey crossfade (s)')
    pg.appendFloat('Phasexfade', label='Phase crossfade (s)')
    pg.appendFloat('Master', label='Master level (fixed, <= 0.9)')
    pg.appendInt('Particleres', label='Particles (res x res)')
    pg.appendInt('Outw', label='Output width')
    pg.appendInt('Outh', label='Output height')
    pg.appendInt('Display', label='Projector display index')
    pg.appendToggle('Autoopen', label='Open window on start')
    pg.appendDAT('Looks', label='Looks DAT')
    pg.appendDAT('Rehearsallog', label='Rehearsal log DAT')
    pg.appendPulse('Openwindow', label='Open output window')
    defaults = {'Xfade': 8.0, 'Phasexfade': 6.0, 'Master': 0.85, 'Particleres': 128,
                'Outw': 1280, 'Outh': 720, 'Display': 0, 'Rehearsal': False, 'Autoopen': False}
    for k, v in defaults.items():
        setp(show, k, v)
    try:
        show.par.Master.normMin = 0.3; show.par.Master.normMax = 0.9
        show.par.Master.min = 0.3; show.par.Master.max = 0.9
        show.par.Master.clampMin = True; show.par.Master.clampMax = True
        show.par.Particleres.normMin = 64; show.par.Particleres.normMax = 512
    except Exception as e:
        _warn('par ranges: %s' % e)
    if looks_dat is not None:
        setp(show, 'Looks', looks_dat.path)
    if log_dat is not None:
        setp(show, 'Rehearsallog', log_dat.path)

    RES = ("parent().par.Outw", "parent().par.Outh")
    PRES = ("parent().par.Particleres", "parent().par.Particleres")

    # ---- OSC in ----
    osc_in = mk(show, oscinCHOP, 'osc_in', -1400, 400, port=7000)
    osc_cb = text_dat(show, 'osc_cb', -1400, 100, OSC_CB, 'python')
    osc_dat = mk(show, oscinDAT, 'osc_dat', -1400, 250, port=7000, shared=True, splitbundle=True,
                 maxlines=64, clamp=True, callbacks='osc_cb')
    osc_out = mk(show, oscoutDAT, 'osc_out', -1400, -50, address='127.0.0.1', port=7000)

    # ---- brain ----
    brain = mk(show, executeDAT, 'brain', -1200, 250, framestart=True, start=True)
    brain.text = BRAIN_CORE + BRAIN_GLUE % {'channels': OUT_CHANNELS}
    setp(brain, 'language', 'python')

    raw = mk(show, constantCHOP, 'raw', -1000, 400)
    try:
        raw.seq.const.numBlocks = len(OUT_CHANNELS)
    except Exception as e:
        _warn('raw: const sequence: %s' % e)
    for i, ch in enumerate(OUT_CHANNELS):
        setp(raw, 'const%dname' % i, ch)
        setp(raw, 'const%dvalue' % i, 0.0)
    ease = mk(show, lagCHOP, 'ease', -850, 400, lag1=0.15, lag2=0.6)
    wire(raw, ease)
    calm = mk(show, filterCHOP, 'calm', -700, 400, width=0.3)
    wire(ease, calm)
    ctl = mk(show, nullCHOP, 'ctl', -550, 400)
    wire(calm, ctl)

    # ---- particles ----
    seed = mk(show, constantTOP, 'seed', -1000, 0, outputresolution='custom', format='rgba32float',
              alpha=0.0)
    setp(seed, 'resolutionw', expr=PRES[0]); setp(seed, 'resolutionh', expr=PRES[1])
    setp(seed, 'colorr', 0.0); setp(seed, 'colorg', 0.0); setp(seed, 'colorb', 0.0)
    sim_fb = mk(show, feedbackTOP, 'sim_fb', -850, 0, top='sim')
    wire(seed, sim_fb)
    sim = glsl_top(show, 'sim', -700, 0, SIM_GLSL, PRES, 'rgba32float')
    wire(sim_fb, sim)
    setp(sim, 'inputfiltertype', 'nearest')
    uniforms(sim, [
        ('uA', ['absTime.seconds', 'absTime.stepSeconds', C('speed'), C('turb')]),
        ('uB', [C('emit'), C('breath'), C('presence'), C('onset')]),
        ('uF', [C('form0'), C('form1'), C('form2'), C('form3')]),
        ('uG', [C('form4'), C('size'), C('bass'), C('sparkle')]),
    ])
    pcol = glsl_top(show, 'pcol', -550, 0, PCOL_GLSL, PRES, 'rgba16float')
    wire(sim, pcol)
    setp(pcol, 'inputfiltertype', 'nearest')
    uniforms(pcol, [('uP%d' % i, [C('pal%dr' % i), C('pal%dg' % i), C('pal%db' % i), '1']) for i in range(5)]
             + [('uW', [C('warmth'), C('sparkle'), C('presence'), 'absTime.seconds'])])
    sprite = glsl_top(show, 'sprite', -550, -200, SPRITE_GLSL, ('64', '64'), 'rgba8fixed')

    geo = mk(show, geometryCOMP, 'geo', -350, 0)
    for c in list(geo.children):
        c.destroy()
    rect = mk(geo, rectangleSOP, 'mote', 0, 0)
    # mote size lives on the SOP (a COMP scale would also scale the instance positions)
    setp(rect, 'sizex', expr="0.03 * op('../ctl')['size']")
    setp(rect, 'sizey', expr="0.03 * op('../ctl')['size']")
    rect.render = True; rect.display = True
    mat = mk(show, constantMAT, 'mote_mat', -350, -200, blending=True, srcblend='one', destblend='one',
             depthtest=False, depthwriting=False, colormap='sprite', applypointcolor=True)
    setp(geo, 'material', 'mote_mat')
    setp(geo, 'instancing', True)
    setp(geo, 'instanceop', 'sim')
    setp(geo, 'instancetx', 'r'); setp(geo, 'instancety', 'g'); setp(geo, 'instancetz', 'b')
    setp(geo, 'instancecolorop', 'pcol')
    setp(geo, 'instancer', 'r'); setp(geo, 'instanceg', 'g'); setp(geo, 'instanceb', 'b'); setp(geo, 'instancea', 'a')
    cam = mk(show, cameraCOMP, 'cam', -350, 200, tz=5.5,
             ry=Expr('2.5 * math.sin(absTime.seconds * 0.021)'), rx=Expr('1.5 * math.sin(absTime.seconds * 0.017)'))
    render = mk(show, renderTOP, 'render', -150, 0, camera='cam', geometry='geo', lights='',
                outputresolution='custom', format='rgba16float')
    setp(render, 'resolutionw', expr=RES[0]); setp(render, 'resolutionh', expr=RES[1])
    setp(render, 'bgcolorr', 0); setp(render, 'bgcolorg', 0); setp(render, 'bgcolorb', 0); setp(render, 'bgcolora', 0)

    # ---- trails ----
    black = mk(show, constantTOP, 'black', -150, -250, outputresolution='custom', format='rgba16float', alpha=1.0)
    setp(black, 'resolutionw', expr=RES[0]); setp(black, 'resolutionh', expr=RES[1])
    setp(black, 'colorr', 0.0); setp(black, 'colorg', 0.0); setp(black, 'colorb', 0.0)
    trail_fb = mk(show, feedbackTOP, 'trail_fb', 0, -150, top='trail')
    wire(black, trail_fb)
    trail = glsl_top(show, 'trail', 150, 0, TRAIL_GLSL, RES, 'rgba16float')
    wire(render, trail, 0); wire(trail_fb, trail, 1)
    uniforms(trail, [('uT', [C('trail'), C('zoom'), C('swirl'), 'absTime.stepSeconds'])])

    # ---- seizure guard ----
    safe_fb = mk(show, feedbackTOP, 'safe_fb', 300, -150, top='safe')
    wire(black, safe_fb)
    safe = glsl_top(show, 'safe', 450, 0, SAFE_GLSL, RES, 'rgba16float')
    wire(trail, safe, 0); wire(safe_fb, safe, 1)
    uniforms(safe, [
        ('uS', [C('master'), '2.4', 'absTime.stepSeconds', '0.8']),
        ('uP0', [C('pal0r'), C('pal0g'), C('pal0b'), '1']),
        ('uP1', [C('pal1r'), C('pal1g'), C('pal1b'), '1']),
        ('uV', [C('presence'), C('breath'), 'absTime.seconds', '0']),
    ])
    out = mk(show, nullTOP, 'out', 600, 0)
    wire(safe, out)
    try:
        show.par.top = 'out'          # the container's own background = the show
    except Exception:
        pass

    # ---- output window ----
    win = mk(show, windowCOMP, 'window', 750, 0, winop='out', borders=False, alwaysontop=True,
             title='Resonance Show', justifyh='center', justifyv='center')
    setp(win, 'display', expr='parent().par.Display')
    setp(win, 'winw', expr='parent().par.Outw'); setp(win, 'winh', expr='parent().par.Outh')
    setp(win, 'size', 'custom')
    setp(win, 'cursorvisible', 'nocursor')
    win_exec = mk(show, parameterexecuteDAT, 'window_exec', 750, -200, op='..', pars='Openwindow', onpulse=True)
    win_exec.text = (
        "def onPulse(par):\n"
        "\tif par.name == 'Openwindow':\n"
        "\t\top('window').par.winopen.pulse()\n"
        "\treturn\n"
    )

    # ---- recorder (self-test / documentation captures) ----
    rec = mk(show, moviefileoutTOP, 'rec', 750, 200, type='movie', record=False)
    wire(out, rec)

    # ---- notes ----
    text_dat(show, 'README', -1400, 650,
             'Resonance Show %s\n\n'
             'Live: run `node scripts/osc-relay.mjs` on the kiosk and add ?osc=1 to the kiosk URL.\n'
             'Rehearsal: toggle Show > Rehearsal (plays /project1/rehearsal_log into osc_in via osc_out).\n'
             'Projector: set Display, Outw/Outh, pulse Open output window (or F1 perform mode).\n'
             'Looks: one per journey from looks.json; unknown journeys use the live palette default.\n'
             'Seizure law: audio moves things, it never switches light (see safe_pixel).\n' % VERSION)

    show.store('built', True)
    show.store('version', VERSION)
    _REPORT['ops'] = len(show.findChildren(depth=1))
    return _REPORT

# ---------------------------------------------------------------------------
# self-test (RESONANCE_TD_SELFTEST=<outdir>): rehearse, record 20 s, report, quit
# ---------------------------------------------------------------------------
def selftest(show, outdir, seconds=24.0, warmup=6.0):
    import os
    os.makedirs(outdir, exist_ok=True)
    show.par.Rehearsal = True
    rec = show.op('rec')
    rec.par.file = os.path.join(outdir, 'td-show.mov')
    run("op(%r).par.record = True" % rec.path, delayFrames=int(warmup * 60))
    run("op('/project1/build_show').module.selftest_finish(op(%r), %r)" % (show.path, outdir),
        delayFrames=int((warmup + seconds) * 60))

def selftest_finish(show, outdir):
    import os
    rec = show.op('rec')
    rec.par.record = False
    errs, warns = [], []
    for o in show.findChildren():
        try:
            e = o.errors()
            if e:
                errs.append('%s: %s' % (o.path, e))
            w = o.warnings()
            if w:
                warns.append('%s: %s' % (o.path, w))
        except Exception:
            pass
    tops = {}
    for nm in ('sim', 'pcol', 'render', 'trail', 'safe'):
        try:
            a = show.op(nm).numpyArray()
            tops[nm] = {'res': [int(a.shape[1]), int(a.shape[0])], 'mean': [round(float(x), 4) for x in a.reshape(-1, 4).mean(0)],
                        'max': [round(float(x), 4) for x in a.reshape(-1, 4).max(0)]}
            if nm == 'sim':
                tops[nm]['alive'] = round(float((a[..., 3] > 0).mean()), 4)
        except Exception as ex:
            tops[nm] = 'n/a: %s' % ex
    ctl = {}
    try:
        for c in show.op('ctl').chans():
            ctl[c.name] = round(float(c.eval()), 4)
    except Exception:
        pass
    b = show.op('brain').module._S.get('brain')
    osc = show.op('osc_in')
    report = {
        'version': VERSION,
        'fps': project.cookRate,
        'osc_channels': osc.numChans if osc is not None else 0,
        'switches': b.switches if b else [],
        'look': show.fetch('look', ''),
        'errors': errs,
        'warnings': warns,
        'tops': tops,
        'ctl': ctl,
        'movie': rec.par.file.eval(),
    }
    with open(os.path.join(outdir, 'td-selftest.json'), 'w') as f:
        json.dump(report, f, indent=1)
    run("project.quit(force=True)", delayFrames=30)
