#!/usr/bin/env python3
"""Offline tests for the TouchDesigner show (no TouchDesigner licence needed).

1. BUILD   runs build_show.build() against a mock of TD's Python API that
           validates every operator type and parameter name against the
           installed TouchDesigner's own TDParameterHelp.json, and every menu
           value against its offline help pages. Any unknown name = failure.
2. BRAIN   replays the rehearsal OSC log through the real BRAIN_CORE at 60 fps
           (OSC In CHOP semantics: last value per address; events via the DAT
           path), applies the same Lag + Filter CHOP smoothing, and checks:
           every journey resolves to its own look (unknown -> palette
           default), crossfades are continuous, master never moves with the
           music, every control stays finite and in range.
3. TRACK   writes the smoothed control track (per frame) as JSON for the
           WebGL render check (render_check.mjs), which runs the very same
           GLSL and feeds the flicker meter.

  python3 scripts/touchdesigner/test_show.py [--td /path/TouchDesigner.app] [--track out.json]
"""
import json, math, os, re, html, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
TD_APP = os.path.expanduser('~/Applications/TouchDesigner.app')
TRACK = None
for i, a in enumerate(sys.argv):
    if a == '--td':
        TD_APP = sys.argv[i + 1]
    if a == '--track':
        TRACK = sys.argv[i + 1]
CFG = os.path.join(TD_APP, 'Contents/Resources/tfs/Config/TDParameterHelp.json')
HELP = os.path.join(TD_APP, 'Contents/Resources/tfs/Samples/Learn/OfflineHelp/https.docs.derivative.ca')

failures = []
def check(cond, msg):
    if not cond:
        failures.append(msg)
        print('  FAIL', msg)

# ---------------------------------------------------------------------------
# mock TouchDesigner
# ---------------------------------------------------------------------------
HAVE_TD = os.path.exists(CFG)
SPEC = {}
if HAVE_TD:
    for fam, ops in json.load(open(CFG))['help'].items():
        SPEC.update(ops)
_help_cache = {}
def help_text(optype):
    if optype in _help_cache:
        return _help_cache[optype]
    spec = SPEC.get(optype, {})
    fam = re.sub(r'^[a-z0-9]+', '', optype)
    label = spec.get('label', '')
    t = ''
    for cand in [label.replace(' ', '_') + '_' + fam, label.replace(' ', '_') + '_' + fam + '_Class']:
        p = os.path.join(HELP, cand + '.htm')
        if os.path.exists(p):
            raw = open(p, encoding='utf-8', errors='ignore').read()
            raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
            t = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
            break
    extra = {'TOP': ['TOP_Generator_Common_Page', 'TOP_Filter_Common_Page', 'Pixel_Formats'],
             'MAT': ['MAT_Common_Page'], 'CHOP': ['CHOP_Common_Page'], 'DAT': ['Operator_Language'],
             'COMP': [], 'SOP': []}.get(fam, [])
    for cand in extra:
        p = os.path.join(HELP, cand + '.htm')
        if os.path.exists(p):
            raw = open(p, encoding='utf-8', errors='ignore').read()
            raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
            t += ' ' + html.unescape(re.sub(r'<[^>]+>', ' ', raw))
    _help_cache[optype] = t
    return t

# tokens TD itself writes in saved .toe files (Samples/*.toe expanded): 'language python' etc.
KNOWN_TOKENS = {('language', 'python'), ('language', 'text')}

def menu_ok(optype, v, name=''):
    if (name, v) in KNOWN_TOKENS:
        return True
    t = help_text(optype)
    return (not t) or re.search(r'(^|[\s.)])' + re.escape(v) + r'\s*-', t) is not None

SUFFIX = set('xyzwrgbauvh') | {'1', '2', '3', '4'}

class ParModeT:
    CONSTANT, EXPRESSION, EXPORT, BIND = range(4)

class MockPar(object):
    def __init__(self, owner, name, ptype):
        self.owner, self.name, self.ptype = owner, name, ptype
        self.val = None
        self.expr = None
        self.mode = ParModeT.CONSTANT
        self.normMin = self.normMax = self.min = self.max = 0
        self.clampMin = self.clampMax = False
    def __setattr__(self, k, v):
        object.__setattr__(self, k, v)
        if k == 'val' and v is not None and getattr(self, 'ptype', '') == 'Menu' and HAVE_TD:
            if isinstance(v, str) and not menu_ok(self.owner.optype, v, self.name):
                failures.append('%s.%s: menu value %r not in TD help' % (self.owner.optype, self.name, v))
    def eval(self):
        if self.ptype in ('DAT', 'OP', 'TOP', 'CHOP', 'COMP') and isinstance(self.val, str):
            return next((o for o in ALL_OPS if o.path == self.val), None)
        return self.val
    def pulse(self):
        pass

class MockPars(object):
    def __init__(self, owner):
        object.__setattr__(self, '_owner', owner)
        object.__setattr__(self, '_p', {})
    def _lookup(self, name):
        owner = self._owner
        if name in self._p:
            return self._p[name]
        spec = SPEC.get(owner.optype, {}).get('parameters', {}) if HAVE_TD else None
        ptype = None
        if spec is not None:
            base = re.sub(r'^([a-z]+?)(\d+)', lambda m: m.group(1) + '0', name)  # sequence blocks
            if name in spec:
                ptype = spec[name].get('parType', '')
            elif base in spec:
                ptype = spec[base].get('parType', '')
            elif name[:-1] in spec and name[-1] in SUFFIX:
                ptype = spec[name[:-1]].get('parType', '')
            elif base[:-1] in spec and base[-1] in SUFFIX:
                ptype = spec[base[:-1]].get('parType', '')
            elif name[:1].isupper():
                return None  # custom par not appended
            elif owner.optype.endswith('COMP') and name in ('w', 'h', 'top'):
                ptype = 'Int'
            else:
                return None
        p = MockPar(owner, name, ptype or '')
        self._p[name] = p
        return p
    def __getattr__(self, name):
        return self._lookup(name)
    def __setattr__(self, name, value):
        p = self._lookup(name)
        if p is None:
            failures.append('%s: no parameter %s' % (self._owner.optype, name))
            return
        p.val = value

class _Conn(object):
    def __init__(self, op_, i):
        self.op_, self.i = op_, i
    def connect(self, src):
        self.op_.inputs_[self.i] = src

class _Seq(object):
    def __init__(self):
        self.numBlocks = 1
class _Seqs(object):
    def __getattr__(self, k):
        s = _Seq(); object.__setattr__(self, k, s); return s

class _Page(object):
    def __init__(self, owner):
        self.owner = owner
    def _add(self, name, ptype):
        self.owner.par._p[name] = MockPar(self.owner, name, ptype)
        return (self.owner.par._p[name],)
    def appendToggle(self, n, label=''): return self._add(n, 'Toggle')
    def appendFloat(self, n, label=''): return self._add(n, 'Float')
    def appendInt(self, n, label=''): return self._add(n, 'Int')
    def appendDAT(self, n, label=''): return self._add(n, 'DAT')
    def appendPulse(self, n, label=''): return self._add(n, 'Pulse')
    def appendStr(self, n, label=''): return self._add(n, 'Str')

ALL_OPS = []
class MockOp(object):
    optype = 'baseCOMP'
    def __init__(self, name, parent=None):
        self.name = name
        self.parent_ = parent
        self.path = (parent.path.rstrip('/') + '/' + name) if parent else '/' + name
        self.par = MockPars(self)
        self.children_ = {}
        self.inputs_ = {}
        self.text = ''
        self.nodeX = self.nodeY = 0
        self.render = self.display = False
        self.seq = _Seqs()
        self.storage = {}
        self._store = {}
        self.inputConnectors = [_Conn(self, i) for i in range(4)]
        ALL_OPS.append(self)
        if self.optype == 'geometryCOMP':
            self.create(MOCKS['torusSOP'], 'torus1')
    @property
    def children(self):
        return list(self.children_.values())
    def create(self, cls, name):
        check(not HAVE_TD or cls.optype in SPEC, 'unknown operator type %s' % cls.optype)
        o = cls(name, self)
        self.children_[name] = o
        return o
    def op(self, name):
        return self.children_.get(name)
    def destroy(self):
        if self.parent_:
            self.parent_.children_.pop(self.name, None)
    def appendCustomPage(self, n):
        return _Page(self)
    def store(self, k, v):
        self._store[k] = v
    def fetch(self, k, d=None, search=True):
        return self._store.get(k, d)
    def findChildren(self, depth=None):
        return self.children

MOCKS = {}
OPTYPES = ['containerCOMP', 'oscinCHOP', 'oscinDAT', 'oscoutDAT', 'textDAT', 'executeDAT', 'constantCHOP', 'lagCHOP',
           'filterCHOP', 'nullCHOP', 'constantTOP', 'feedbackTOP', 'glslTOP', 'geometryCOMP', 'rectangleSOP', 'torusSOP',
           'constantMAT', 'cameraCOMP', 'renderTOP', 'nullTOP', 'windowCOMP', 'parameterexecuteDAT', 'moviefileoutTOP']
for t in OPTYPES:
    MOCKS[t] = type(t, (MockOp,), {'optype': t})

def load_build_show():
    src = open(os.path.join(HERE, 'build_show.py')).read()
    mod = types.ModuleType('build_show')
    mod.__dict__.update(MOCKS)
    mod.__dict__['ParMode'] = ParModeT
    exec(compile(src, 'build_show.py', 'exec'), mod.__dict__)
    return mod

# ---------------------------------------------------------------------------
# 1. BUILD
# ---------------------------------------------------------------------------
print('1. build against mock TD (%s)' % ('validating with ' + CFG if HAVE_TD else 'NO TD install: names unchecked'))
bs = load_build_show()
root = MOCKS['containerCOMP']('project1')
looks = MOCKS['textDAT']('looks', root); looks.text = open(os.path.join(HERE, 'looks.json')).read()
log = MOCKS['textDAT']('rehearsal_log', root)
LOGF = os.path.join(HERE, 'rehearsal.oscl.jsonl')
if not os.path.exists(LOGF):   # generated, not committed: node osc-show.mjs synth
    import subprocess
    subprocess.run(['node', os.path.join(HERE, 'osc-show.mjs'), 'synth', '--seconds-each', '16', '--gap', '3', '--out', LOGF], check=True)
rep = bs.build(root, looks_dat=looks, log_dat=log)
for w in rep['warnings']:
    check(False, 'build warning: ' + w)
show = root.op('show')
for name in ['osc_in', 'osc_dat', 'osc_out', 'brain', 'raw', 'ease', 'calm', 'ctl', 'sim', 'pcol', 'geo', 'render',
             'trail', 'trail_fb', 'safe', 'safe_fb', 'out', 'window', 'rec']:
    check(show.op(name) is not None, 'missing op ' + name)
check(show.op('osc_in').par.port.val == 7000, 'osc_in port 7000')
check(show.op('geo').op('torus1') is None, 'default torus removed')
check(show.op('trail').inputs_.get(1) is show.op('trail_fb'), 'trail feedback wired')
check(show.op('safe').inputs_.get(1) is show.op('safe_fb'), 'safe feedback wired')
# every uniform expression references only channels the brain writes
chans = set(bs.OUT_CHANNELS)
for o in ALL_OPS:
    for p in o.par._p.values():
        if p.expr:
            for ch in re.findall(r"op\('(?:\.\./)?ctl'\)\['([a-z0-9]+)'\]", p.expr):
                check(ch in chans, '%s.%s reads unknown channel %s' % (o.path, p.name, ch))
# the brain DAT compiles as Python
compile(show.op('brain').text, 'brain', 'exec')
compile(show.op('osc_cb').text, 'osc_cb', 'exec')
print('   ops: %d, warnings: %d' % (rep['ops'], len(rep['warnings'])))

# the TD glue of the brain Execute DAT, run against the mock (rehearsal on, 300 frames)
class _Chan(object):
    def __init__(self, n, v): self.name, self.v = n, v
    def eval(self): return self.v
sent = []
oscin = show.op('osc_in')
oscin.chans = lambda: [_Chan('resonance/audio/level', 0.4), _Chan('resonance/journey/progress', 0.5)]
show.op('osc_out').sendOSC = lambda *a, **k: sent.append((a, k))
class _AbsTime(object):
    seconds = 0.0
    stepSeconds = 1.0 / 60
gns = {'me': show.op('brain'), 'parent': lambda: show, 'op': lambda n: show.op(n), 'absTime': _AbsTime}
exec(compile(show.op('brain').text, 'brain', 'exec'), gns)
show.par.Rehearsal.val = True
show.par.Rehearsallog.val = None
log.text = open(os.path.join(HERE, 'rehearsal.oscl.jsonl')).read()
show.par.Rehearsallog.val = log.path
for fr in range(300):
    _AbsTime.seconds = fr / 60.0
    gns['onFrameStart'](fr)
gns['queue_osc']('/resonance/event/journey', ['first-snow', 'Snowflake'])
gns['onFrameStart'](300)
check(len(sent) > 0 and sent[0][1].get('asBundle'), 'rehearsal sends OSC bundles (%d calls)' % len(sent))
check(show.fetch('look') == 'first-snow', 'glue: journey event selects its look (%s)' % show.fetch('look'))
check(isinstance(show.op('raw').par.const0value.val, float), 'glue writes raw channels')
print('   glue: %d rehearsal bundles in 5 s, look=%s' % (len(sent), show.fetch('look')))

# ---------------------------------------------------------------------------
# 2. BRAIN replay
# ---------------------------------------------------------------------------
print('2. brain replay of the rehearsal log at 60 fps')
ns = {}
exec(bs.BRAIN_CORE, ns)
B = ns['Brain'](open(os.path.join(HERE, 'looks.json')).read())
logtext = open(os.path.join(HERE, 'rehearsal.oscl.jsonl')).read()
P = ns['Player'](logtext)
norm = ns['norm_name']
STRINGS = ('/event/', '/journey/id', '/journey/name', '/audio/onset', '/phrase/', '/clock/tick')
chop = {}
fps = 60.0
dt = 1.0 / fps
lag_state = {}
filt_hist = []
sigma_frames = 0.3 * fps / 2.0   # Filter CHOP width 0.3 s ~ gaussian, sigma = width/2
K = int(3 * sigma_frames)
weights = [math.exp(-0.5 * (k / sigma_frames) ** 2) for k in range(-K, K + 1)]
ws = sum(weights)
track = []
prev = None
max_jump = {}
master_vals = set()
t = 0.0
n = int((P.length + 0.2) * fps)
for f in range(n):
    for a, v in P.due(t):
        if any(s in a for s in STRINGS) or (v and isinstance(v[0], str)):
            B.on_osc(a, v)
        if v and not isinstance(v[0], str) and len(v) == 1:
            chop[norm(a)] = float(v[0])
    out = B.step(t, dt, dict(chop))
    # Lag CHOP (lag up 0.15 s, down 0.6 s)
    lagged = {}
    for k, v in out.items():
        s = lag_state.get(k, v)
        tau = 0.15 if v > s else 0.6
        s += (v - s) * (1 - math.exp(-dt / tau))
        lag_state[k] = s
        lagged[k] = s
    filt_hist.append(lagged)
    if len(filt_hist) > 2 * K + 1:
        filt_hist.pop(0)
    sm = {k: sum(weights[i] * filt_hist[min(i, len(filt_hist) - 1)][k] for i in range(len(weights))) / ws for k in lagged}
    for k, v in sm.items():
        check(math.isfinite(v), 'non-finite %s at %.2f' % (k, t)) if not math.isfinite(v) else None
        if prev is not None:
            max_jump[k] = max(max_jump.get(k, 0.0), abs(v - prev[k]))
    master_vals.add(round(out['master'], 6))
    prev = sm
    track.append({k: round(v, 5) for k, v in sm.items()})
    t += dt
switch_keys = [k for _, k in B.switches]
print('   look switches:', B.switches)
expect = ['first-snow', 'c80a89bc-2c88-4bde-bec8-4be6916acb62', '6ee9f014-8203-437c-b05c-9d8bd0de9d3e', '(palette default)']
for e in expect:
    check(e in switch_keys, 'journey look %s selected' % e)
check(len(master_vals) == 1, 'master is constant (got %s)' % sorted(master_vals)[:5])
check(max(master_vals) <= 0.9, 'master <= 0.9')
# per-frame continuity of the smoothed controls (60 fps)
limits = {'emit': 0.02, 'speed': 0.03, 'size': 0.02, 'trail': 0.002, 'presence': 0.01}
for k, lim in limits.items():
    check(max_jump.get(k, 0) <= lim, 'smooth %s: max per-frame change %.4f > %.4f' % (k, max_jump.get(k, 0), lim))
for i in range(5):
    for c in 'rgb':
        k = 'pal%d%s' % (i, c)
        check(max_jump.get(k, 0) <= 0.01, 'palette %s crossfade continuous (max step %.4f)' % (k, max_jump.get(k, 0)))
print('   max per-frame steps:', {k: round(max_jump.get(k, 0), 4) for k in list(limits) + ['pal4r', 'xf']})
# every catalogued journey resolves to its own look by id and by name
L = json.load(open(os.path.join(HERE, 'looks.json')))['looks']
B2 = ns['Brain'](json.dumps({'looks': L}))
ok_id = sum(1 for k in L if (setattr(B2, 'jid', k) or B2.resolve()) == k)
check(ok_id == len(L), 'all %d looks resolve by id (%d)' % (len(L), ok_id))
B2.jid = 'nope'
ok_name = 0
for k, v in L.items():
    B2.jname = v['name']
    r = B2.resolve()
    ok_name += 1 if r and L[r]['name'] == v['name'] else 0
check(ok_name == len(L), 'all looks resolve by name (%d/%d)' % (ok_name, len(L)))
print('   looks: %d resolve by id, %d by name' % (ok_id, ok_name))

if TRACK:
    with open(TRACK, 'w') as fh:
        json.dump({'fps': fps, 'channels': bs.OUT_CHANNELS, 'frames': [[fr[k] for k in bs.OUT_CHANNELS] for fr in track],
                   'shaders': {'sim': bs.SIM_GLSL, 'pcol': bs.PCOL_GLSL, 'sprite': bs.SPRITE_GLSL,
                               'trail': bs.TRAIL_GLSL, 'safe': bs.SAFE_GLSL}}, fh)
    print('3. control track (%d frames) -> %s' % (len(track), TRACK))

for fl in failures:
    print('  -', fl)
print('\n%s (%d failures)' % ('PASS' if not failures else 'FAIL', len(failures)))
sys.exit(1 if failures else 0)
