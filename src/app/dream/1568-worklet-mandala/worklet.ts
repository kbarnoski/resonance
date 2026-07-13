// ─────────────────────────────────────────────────────────────────────────────
// worklet.ts — the CSS Houdini AnimationWorklet path (progressive enhancement).
//
// AnimationWorklet runs an `animate(currentTime, effect)` callback on the
// COMPOSITOR thread, off the main thread. We register ONE stateless animator,
// "mandala-spin", that maps the document timeline onto each ring's KeyframeEffect
// localTime, scaled by a per-ring `speed` option. The direction of each ring is
// baked into its keyframes; live pitch is applied via each WorkletAnimation's
// playbackRate (also honored on the compositor). Result: the whole lattice of
// ring wrappers spins off the main thread.
//
// This is enhancement only — where AnimationWorklet is absent (most browsers,
// and any headless container) the rAF fallback in page.tsx drives the IDENTICAL
// ring transforms. The worklet source below is a plain string → Blob → module
// URL, and it contains no nondeterministic-entropy tokens (the determinism rule
// applies inside the worklet source too).
// ─────────────────────────────────────────────────────────────────────────────

/** The worklet module, as source text. Loaded via a Blob URL. */
export function buildWorkletSource(): string {
  return `
registerAnimator('mandala-spin', class {
  constructor(options) {
    var o = options || {};
    // per-ring base speed multiplier; folded with duration to set deg/sec.
    this.speed = typeof o.speed === 'number' ? o.speed : 1;
  }
  animate(currentTime, effect) {
    // Map compositor time onto the effect's local time. iterations:Infinity
    // keyframes make this a continuous rotation; playbackRate (set on the
    // WorkletAnimation from the main thread) scales it live for pitch.
    effect.localTime = currentTime * this.speed;
  }
});
`;
}

// ── minimal ambient types (AnimationWorklet is not in lib.dom) ───────────────

export interface WorkletAnimationLike {
  playbackRate: number;
  play(): void;
  cancel(): void;
}

interface AnimationWorkletNamespace {
  addModule(url: string): Promise<void>;
}

interface HoudiniCSS {
  animationWorklet?: AnimationWorkletNamespace;
}

type WorkletAnimationCtor = new (
  name: string,
  effect: KeyframeEffect,
  timeline?: AnimationTimeline,
  options?: unknown
) => WorkletAnimationLike;

/** True if this browser exposes the AnimationWorklet surface we need. */
export function hasAnimationWorklet(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "animationWorklet" in CSS &&
    typeof (globalThis as { WorkletAnimation?: unknown }).WorkletAnimation ===
      "function"
  );
}

/** Load the animator module once. Resolves true on success, false otherwise. */
export async function registerMandalaWorklet(): Promise<boolean> {
  if (!hasAnimationWorklet()) return false;
  const hcss = CSS as unknown as HoudiniCSS;
  const ns = hcss.animationWorklet;
  if (!ns) return false;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(
      new Blob([buildWorkletSource()], { type: "application/javascript" })
    );
    await ns.addModule(url);
    return true;
  } catch {
    return false;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Attach a compositor-driven spin to one ring wrapper element.
 *  Returns the WorkletAnimation (so playbackRate can be updated live) or null. */
export function attachRingWorklet(
  el: Element,
  dir: 1 | -1,
  speedMult: number,
  baseDurationMs: number
): WorkletAnimationLike | null {
  const Ctor = (globalThis as { WorkletAnimation?: WorkletAnimationCtor })
    .WorkletAnimation;
  if (!Ctor) return null;
  const to = dir > 0 ? "rotate(360deg)" : "rotate(-360deg)";
  try {
    const effect = new KeyframeEffect(
      el,
      [{ transform: "rotate(0deg)" }, { transform: to }],
      { duration: baseDurationMs, iterations: Infinity }
    );
    // Per-ring base speed is a compositor-side option (scales localTime inside
    // the animator); live pitch rides on playbackRate, updated from main thread.
    const anim = new Ctor("mandala-spin", effect, document.timeline, {
      speed: speedMult,
    });
    anim.playbackRate = 1;
    anim.play();
    return anim;
  } catch {
    return null;
  }
}
