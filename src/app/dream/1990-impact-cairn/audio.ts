// ── The impact-cairn audio engine ────────────────────────────────────────────
// Pure Web Audio. Every sound is a modal IMPACT, not a note:
//   short noise excitation → parallel band-pass "modes" at inharmonic ratios
//   (each with an exponential decay) → summed → master (≤0.18) → compressor →
//   destination. ±4% per-hit frequency jitter guarantees no stable pitch forms.
//
// Timing comes from a look-ahead scheduler running off the AudioContext clock
// (schedule ~120 ms ahead). Layers loop at slightly independent rates and phase
// against one another (Steve Reich). Layers are editable memory: you can knock
// one off (delete), change its material (transform), mute, or clear.

import { MATERIALS, ORDER, type MaterialId } from "./materials";
import { mulberry32 } from "./rng";

const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock
const MAX_LAYERS = 5; // bound so the cairn stays legible
const MIN_PERIOD = 0.9; // shortest loop period (seconds)

interface HitEvent {
  t: number; // onset relative to the loop iteration start (seconds)
  velocity: number;
}

interface Layer {
  id: number;
  events: HitEvent[];
  period: number; // base loop length
  rate: number; // phasing multiplier → effective period = period * rate
  material: MaterialId; // mutable: changing it transforms the layer next pass
  muted: boolean;
  nextIterStart: number; // ctx time of the next iteration to schedule
}

export interface LayerInfo {
  id: number;
  material: MaterialId;
  eventCount: number;
  period: number;
  muted: boolean;
}

/** A hit that has just SOUNDED, drained each frame to drive the visuals. */
export interface VisualImpact {
  layerId: number;
  material: MaterialId;
  velocity: number;
}

export class CairnEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;

  private layers: Layer[] = [];
  private pending: HitEvent[] = [];
  private pendingStart = 0;
  private pendingMaterial: MaterialId = "stone";

  private layerSeq = 0;
  private cleanupTimers = new Set<ReturnType<typeof setTimeout>>();
  private visualQueue: { at: number; impact: VisualImpact }[] = [];
  private masterMuted = false;
  private rng = mulberry32(0x1990ca12);

  /** Bumped on every structural change so the UI can re-render lazily. */
  version = 0;

  get ready(): boolean {
    return this.ctx !== null;
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Create the AudioContext inside a user gesture. Returns false if blocked. */
  async begin(): Promise<boolean> {
    if (this.ctx) return true;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.16;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 20;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp);
      comp.connect(ctx.destination);

      // Deterministic white-noise excitation buffer (0.5 s).
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const nrng = mulberry32(0x9e3779b9);
      for (let i = 0; i < len; i++) data[i] = nrng() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.comp = comp;
      this.noise = buf;
      if (ctx.state === "suspended") await ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  // ── one modal impact ───────────────────────────────────────────────────────
  private scheduleHit(materialId: MaterialId, velocity: number, when: number) {
    const ctx = this.ctx;
    const master = this.master;
    const noise = this.noise;
    if (!ctx || !master || !noise) return;
    const m = MATERIALS[materialId];
    const v = Math.max(0.05, Math.min(1, velocity));

    // hitOut collects the whole subgraph; disconnecting it later frees the lot.
    const hitOut = ctx.createGain();
    hitOut.gain.value = m.gain;
    hitOut.connect(master);

    // excitation: a short noise burst, low-passed to the material's colour.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const offset = this.rng() * (noise.duration - m.exciteLen - 0.01);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = m.exciteCutoff;
    const ex = ctx.createGain();
    ex.gain.setValueAtTime(0.0001, when);
    ex.gain.linearRampToValueAtTime(v, when + 0.0006);
    ex.gain.exponentialRampToValueAtTime(0.0008, when + m.exciteLen);
    src.connect(lp);
    lp.connect(ex);

    // a touch of the raw excitation as the broadband "click" of contact.
    const click = ctx.createGain();
    click.gain.value = 0.22 * v;
    ex.connect(click);
    click.connect(hitOut);

    // the inharmonic modal bank — the resonance of the struck object.
    const jitter = 1 + (this.rng() * 2 - 1) * 0.04; // ±4% → no stable pitch
    let maxRing = 0;
    for (let i = 0; i < m.ratios.length; i++) {
      const f = m.base * m.ratios[i] * jitter;
      const ring = m.decay * Math.pow(0.6, i);
      const q = Math.min(m.qCap, Math.max(4, ring * Math.PI * f));
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      const amp = m.weights[i] * v;
      g.gain.setValueAtTime(amp, when);
      g.gain.exponentialRampToValueAtTime(0.0004, when + ring);
      ex.connect(bp);
      bp.connect(g);
      g.connect(hitOut);
      if (ring > maxRing) maxRing = ring;
    }

    src.start(when, offset);
    src.stop(when + m.exciteLen + 0.02);

    // free the subgraph once it has fully rung out.
    const delayMs = (when - ctx.currentTime + maxRing + 0.2) * 1000;
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer);
      try {
        hitOut.disconnect();
      } catch {
        /* ignore */
      }
    }, Math.max(0, delayMs));
    this.cleanupTimers.add(timer);
  }

  // ── live tapping ─────────────────────────────────────────────────────────
  /** Play an immediate impact and record it into the pending figure. */
  tap(materialId: MaterialId, velocity: number): void {
    if (!this.ctx) return;
    const when = this.ctx.currentTime + 0.001;
    this.scheduleHit(materialId, velocity, when);
    if (this.pending.length === 0) {
      this.pendingStart = when;
      this.pendingMaterial = materialId;
    }
    this.pending.push({ t: when - this.pendingStart, velocity });
    this.version++;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  discardPending(): void {
    if (this.pending.length === 0) return;
    this.pending = [];
    this.version++;
  }

  /** Commit the pending figure as a looping layer (Reich-style phasing rate). */
  lay(): boolean {
    if (!this.ctx || this.pending.length === 0) return false;
    if (this.layers.length >= MAX_LAYERS) {
      // knock the oldest off to stay legible
      this.layers.shift();
    }
    const evs = this.pending.slice();
    const first = evs[0].t;
    const norm = evs.map((e) => ({ t: e.t - first, velocity: e.velocity }));
    const span = norm[norm.length - 1].t;
    let avgGap = MIN_PERIOD;
    if (norm.length > 1) avgGap = span / (norm.length - 1);
    const period = Math.max(MIN_PERIOD, span + avgGap);
    // distinct small rate per layer → phasing
    const drift = ((this.layerSeq % 5) - 2) * 0.011;
    const layer: Layer = {
      id: ++this.layerSeq,
      events: norm,
      period,
      rate: 1 + drift,
      material: this.pendingMaterial,
      muted: false,
      nextIterStart: this.ctx.currentTime + 0.08,
    };
    this.layers.push(layer);
    this.pending = [];
    this.version++;
    return true;
  }

  /** Knock a stone off — the loop audibly loses this layer. */
  deleteLayer(id: number): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const [gone] = this.layers.splice(idx, 1);
    this.version++;
    // a short tumble so un-making is audible, not just a silent gap.
    this.playTumble(gone.material);
  }

  private playTumble(materialId: MaterialId): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.005;
    const n = 4;
    for (let i = 0; i < n; i++) {
      this.scheduleHit(materialId, 0.5 - i * 0.09, t0 + i * 0.07);
    }
  }

  /** Transform a laid stone: its timbre changes on the next pass. */
  cycleMaterial(id: number): MaterialId | null {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return null;
    const idx = ORDER.indexOf(layer.material);
    layer.material = ORDER[(idx + 1) % ORDER.length];
    this.version++;
    return layer.material;
  }

  toggleLayerMute(id: number): void {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.muted = !layer.muted;
    this.version++;
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.16, now, 0.02);
    }
    this.version++;
  }

  get muted(): boolean {
    return this.masterMuted;
  }

  clear(): void {
    this.layers = [];
    this.pending = [];
    this.version++;
  }

  getLayers(): LayerInfo[] {
    return this.layers.map((l) => ({
      id: l.id,
      material: l.material,
      eventCount: l.events.length,
      period: l.period,
      muted: l.muted,
    }));
  }

  // ── the look-ahead scheduler (called each animation frame) ────────────────
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const layer of this.layers) {
      const eff = layer.period * layer.rate;
      // guard against runaway if the tab was backgrounded
      let guard = 0;
      while (layer.nextIterStart < horizon && guard < 64) {
        this.scheduleIteration(layer);
        layer.nextIterStart += eff;
        guard++;
      }
      if (guard >= 64) layer.nextIterStart = ctx.currentTime + eff;
    }
  }

  private scheduleIteration(layer: Layer): void {
    const start = layer.nextIterStart;
    const material = layer.material; // read live → material change = next pass
    const silent = this.masterMuted || layer.muted;
    for (const ev of layer.events) {
      const when = start + ev.t;
      if (!silent) this.scheduleHit(material, ev.velocity, when);
      // visuals fire whether muted or not, so the cairn stays alive.
      this.visualQueue.push({
        at: when,
        impact: { layerId: layer.id, material, velocity: ev.velocity },
      });
    }
  }

  /** Return the impacts that have sounded since the last drain. */
  drainVisual(): VisualImpact[] {
    const now = this.now();
    const out: VisualImpact[] = [];
    let i = 0;
    while (i < this.visualQueue.length) {
      if (this.visualQueue[i].at <= now) {
        out.push(this.visualQueue[i].impact);
        this.visualQueue.splice(i, 1);
      } else {
        i++;
      }
    }
    return out;
  }

  destroy(): void {
    for (const t of this.cleanupTimers) clearTimeout(t);
    this.cleanupTimers.clear();
    this.layers = [];
    this.visualQueue = [];
    try {
      this.master?.disconnect();
      this.comp?.disconnect();
    } catch {
      /* ignore */
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.noise = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {
        /* ignore */
      });
    }
  }
}
