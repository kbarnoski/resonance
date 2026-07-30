// ════════════════════════════════════════════════════════════════════════════
// ATLAS·DUET (3992) — the self-listening co-creative AGENT.
//
// The NEW layer over 3608-atlas. A machine voice forages the SAME timbre-space
// beside you. It is NOT a random wanderer: it keeps a rolling memory of your
// recent trajectory + the pitch it hears you and itself sound, and decides where
// to move next by blending three legible, deterministic rules — the MACataRT
// idea of an agent that self-listens and traces its own path through a CataRT
// corpus (arXiv 2502.00023, 2025):
//
//   1. COMPLEMENTARITY — it drifts toward the region you are NOT in (if you dwell
//      bright/high, it fills dark/low), so the space stays covered.
//   2. CALL-AND-RESPONSE — after you make a fast gesture (a "phrase"), it echoes a
//      time- and space-shifted version of that recent path a beat later.
//   3. SELF-LISTENING / CONSONANCE — it biases its target toward a grain whose
//      pitch forms a just interval with the pitch you are currently sounding, so
//      the two voices tend to agree.
//
// A single "presence" control scales how loud it is and how far it strays, so the
// coupling can be felt.
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32, type Corpus } from "./duet-corpus";

const MEM_SEC = 3.0; // seconds of human trajectory remembered
const SAMPLE_DT = 0.03; // s between remembered samples
const RESPONSE_DELAY = 0.55; // s — the "beat later" of the echo
const CONS_INTERVAL = 0.18; // s between consonance-grain searches (a musical beat)
const TAIL_MAX = 48; // agent trail length (points)
const TAIL_DT = 0.028; // s between trail samples

// Just intervals as ratios, reduced to within [1, 2). Nearest-match target for
// the consonance metric that brightens the connecting line.
const JUST = [1, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2];

interface Sample {
  t: number;
  x: number;
  y: number;
}

function ratioConsonance(pa: number, pb: number): number {
  if (pa <= 0 || pb <= 0) return 0;
  let r = pa > pb ? pa / pb : pb / pa;
  // Octave-reduce into [1, 2).
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  let best = 1e9;
  for (const j of JUST) {
    const cents = Math.abs(1200 * Math.log2(r / j));
    if (cents < best) best = cents;
  }
  // 0 cents → 1; ~45 cents off → ~0.
  return Math.max(0, Math.min(1, Math.exp(-best / 22)));
}

export class DuetAgent {
  private corpus: Corpus | null = null;
  private rng = mulberry32(0x3992 ^ 0x5a5a);

  pos: [number, number] = [0.45, -0.45];
  consonance = 0;
  gestureRecent = 0; // 0..1 — how recently the human made a fast gesture

  private mem: Sample[] = [];
  private lastSampleAt = -1;
  private speedSmooth = 0;
  private consTarget: [number, number] = [-0.45, 0.45];
  private lastConsAt = -1e9;

  private tail = new Float32Array(TAIL_MAX * 2);
  private tailCount = 0;
  private lastTailAt = -1e9;

  setCorpus(corpus: Corpus): void {
    this.corpus = corpus;
    this.lastConsAt = -1e9;
  }

  reset(): void {
    this.mem = [];
    this.tailCount = 0;
    this.lastSampleAt = -1;
    this.speedSmooth = 0;
    this.gestureRecent = 0;
  }

  /** Newest-first is NOT needed; mem is oldest→newest. Find sample ~delay ago. */
  private delayedHuman(tSec: number, delay: number): Sample | null {
    const target = tSec - delay;
    let chosen: Sample | null = null;
    for (let i = 0; i < this.mem.length; i++) {
      if (this.mem[i].t <= target) chosen = this.mem[i];
      else break;
    }
    return chosen ?? (this.mem.length ? this.mem[0] : null);
  }

  // Scan the corpus for a grain that is (a) consonant with the human pitch and
  // (b) in the complementary brightness/register region. O(n), throttled.
  private searchConsonantGrain(humanPitch: number, hx: number, hy: number): void {
    const c = this.corpus;
    if (!c || c.n === 0 || humanPitch <= 0) return;

    // Desired direction: if the human sits high, answer LOWER (ratios < 1); if
    // low, answer HIGHER — so the agent fills the opposite register.
    const ratios = hy > 0 ? [0.5, 2 / 3, 3 / 4, 4 / 5] : [5 / 4, 4 / 3, 3 / 2, 2];
    const complementX = -Math.sign(hx || 0.001) * 0.5;

    let bestI = -1;
    let bestCost = 1e18;
    for (let i = 0; i < c.n; i++) {
      const p = c.pitchHz[i];
      if (p <= 0) continue;
      // Pitch cost: distance (in octaves) to the nearest desired consonant pitch.
      let pc = 1e9;
      for (const r of ratios) {
        const d = Math.abs(Math.log2(p / (humanPitch * r)));
        if (d < pc) pc = d;
      }
      const gx = c.positions[i * 2];
      const bx = Math.abs(gx - complementX);
      const cost = pc * 1.6 + bx * 1.0;
      if (cost < bestCost) {
        bestCost = cost;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      this.consTarget = [c.positions[bestI * 2], c.positions[bestI * 2 + 1]];
    }
  }

  /**
   * Advance the agent one frame.
   * @returns the agent cursor position (also on `this.pos`).
   */
  update(
    dt: number,
    humanX: number,
    humanY: number,
    humanPitch: number,
    agentPitch: number,
    presence: number,
    tSec: number,
  ): void {
    // ── 1. Remember the human trajectory + estimate gesture speed ─────────────
    if (tSec - this.lastSampleAt >= SAMPLE_DT || this.lastSampleAt < 0) {
      const prev = this.mem.length ? this.mem[this.mem.length - 1] : null;
      if (prev) {
        const sdt = Math.max(1e-3, tSec - prev.t);
        const inst = Math.hypot(humanX - prev.x, humanY - prev.y) / sdt;
        this.speedSmooth += (inst - this.speedSmooth) * 0.35;
      }
      this.mem.push({ t: tSec, x: humanX, y: humanY });
      this.lastSampleAt = tSec;
      const cutoff = tSec - MEM_SEC;
      while (this.mem.length > 2 && this.mem[0].t < cutoff) this.mem.shift();
    }

    // Phrase detection: a fast gesture lifts gestureRecent; it decays after.
    if (this.speedSmooth > 1.1) {
      this.gestureRecent = Math.max(this.gestureRecent, Math.min(1, this.speedSmooth / 2.2));
    }
    this.gestureRecent *= Math.exp(-dt / 1.2);

    // ── 2. Consonance target (throttled corpus search — self-listening) ───────
    if (tSec - this.lastConsAt >= CONS_INTERVAL) {
      this.lastConsAt = tSec;
      this.searchConsonantGrain(humanPitch, humanX, humanY);
    }

    // ── 3. Blend the three rules into one target ──────────────────────────────
    // Complementarity — the region you are not in.
    const compX = -humanX * 0.82;
    const compY = -humanY * 0.82;
    // Call-and-response — your path a beat ago, reflected to the far side.
    const past = this.delayedHuman(tSec, RESPONSE_DELAY);
    const respX = past ? -past.x * 0.82 : compX;
    const respY = past ? -past.y * 0.82 : compY;
    // Consonance — a grain that agrees in pitch and fills the register.
    const consX = this.consTarget[0];
    const consY = this.consTarget[1];

    const wComp = 0.5;
    const wResp = 0.42 * this.gestureRecent;
    const wCons = 0.45;
    const wSum = wComp + wResp + wCons;
    let targetX = (wComp * compX + wResp * respX + wCons * consX) / wSum;
    let targetY = (wComp * compY + wResp * respY + wCons * consY) / wSum;

    // Presence scales how FAR from centre the agent is willing to stray.
    const reach = 0.3 + 0.7 * presence;
    targetX *= reach;
    targetY *= reach;

    // ── 4. Move toward the target (quicker while actively responding) ─────────
    const speedFactor = Math.min(0.55, (1.5 + 2.6 * this.gestureRecent) * dt);
    const jitter = 0.006;
    this.pos[0] += (targetX - this.pos[0]) * speedFactor + (this.rng() - 0.5) * jitter;
    this.pos[1] += (targetY - this.pos[1]) * speedFactor + (this.rng() - 0.5) * jitter;
    this.pos[0] = Math.max(-0.98, Math.min(0.98, this.pos[0]));
    this.pos[1] = Math.max(-0.98, Math.min(0.98, this.pos[1]));

    // ── 5. Consonance readout (line brightness + HUD) — self-listening loop ───
    const targetCons = ratioConsonance(humanPitch, agentPitch);
    this.consonance += (targetCons - this.consonance) * Math.min(1, dt * 6);

    // ── 6. Trailing tail ─────────────────────────────────────────────────────
    if (tSec - this.lastTailAt >= TAIL_DT) {
      this.lastTailAt = tSec;
      if (this.tailCount < TAIL_MAX) {
        this.tail[this.tailCount * 2] = this.pos[0];
        this.tail[this.tailCount * 2 + 1] = this.pos[1];
        this.tailCount++;
      } else {
        this.tail.copyWithin(0, 2);
        this.tail[(TAIL_MAX - 1) * 2] = this.pos[0];
        this.tail[(TAIL_MAX - 1) * 2 + 1] = this.pos[1];
      }
    }
  }

  getTail(): { arr: Float32Array; count: number } {
    return { arr: this.tail, count: this.tailCount };
  }
}
