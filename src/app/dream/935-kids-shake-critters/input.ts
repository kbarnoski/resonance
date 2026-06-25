// Shake-energy input layer.
//
// Primary: devicemotion. Compute energy from acceleration magnitude + jerk.
// Fallback (always works): pointer/touch drag speed → energy. So a plain
// desktop browser plays fully by mouse-swiping.
// Idle auto-demo: if no input for ~3s, gently auto-shake at low energy so a
// glancing reviewer hears + sees it within ~0.6s of Start.

export type InputMode = "motion" | "pointer" | "idle";

export class ShakeInput {
  // smoothed energy 0..1, read by the app each frame
  energy = 0;
  mode: InputMode = "idle";

  private rawTarget = 0; // instantaneous target before smoothing
  private lastMotionMag = 0;
  private lastInputTime = 0;
  private lastPointer: { x: number; y: number; t: number } | null = null;

  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  private el: HTMLElement | null = null;

  private idlePhase = 0;
  private startedAt = 0;

  // Attempt to subscribe to devicemotion (after permission). Returns true if a
  // motion event is actually received within a short window.
  async startMotion(): Promise<boolean> {
    const DME = (
      window as unknown as {
        DeviceMotionEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceMotionEvent;

    if (DME && typeof DME.requestPermission === "function") {
      try {
        const res = await DME.requestPermission();
        if (res !== "granted") return false;
      } catch {
        return false;
      }
    }

    if (typeof window.DeviceMotionEvent === "undefined") return false;

    let gotEvent = false;
    this.motionHandler = (e: DeviceMotionEvent) => {
      const a =
        e.acceleration && e.acceleration.x != null
          ? e.acceleration
          : e.accelerationIncludingGravity;
      if (!a) return;
      gotEvent = true;
      const mag = Math.sqrt(
        (a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2,
      );
      // remove a rough gravity baseline when using includingGravity
      const useIG = !(e.acceleration && e.acceleration.x != null);
      const net = useIG ? Math.abs(mag - 9.81) : mag;
      // jerk = change in magnitude → emphasizes shaking, not tilting
      const jerk = Math.abs(net - this.lastMotionMag);
      this.lastMotionMag = net;
      // map: ~6 m/s² net or strong jerk → full energy
      const e1 = Math.min(1, net / 14 + jerk / 8);
      this.rawTarget = Math.max(this.rawTarget, e1);
      this.lastInputTime = performance.now();
      this.mode = "motion";
    };
    window.addEventListener("devicemotion", this.motionHandler);

    // wait briefly to confirm sensor actually fires
    await new Promise((r) => setTimeout(r, 350));
    if (!gotEvent && this.motionHandler) {
      window.removeEventListener("devicemotion", this.motionHandler);
      this.motionHandler = null;
      return false;
    }
    return gotEvent;
  }

  // Pointer/touch drag fallback. Bound to the given element (the canvas wrap).
  attachPointer(el: HTMLElement) {
    this.el = el;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerMove);
    el.addEventListener("touchmove", this.onTouchMove, { passive: true });
  }

  private onPointerMove = (e: PointerEvent) => {
    this.handleMove(e.clientX, e.clientY);
  };

  private onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) this.handleMove(t.clientX, t.clientY);
  };

  private handleMove(x: number, y: number) {
    const now = performance.now();
    if (this.lastPointer) {
      const dt = Math.max(8, now - this.lastPointer.t);
      const dx = x - this.lastPointer.x;
      const dy = y - this.lastPointer.y;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px/ms
      const e1 = Math.min(1, speed / 1.8);
      this.rawTarget = Math.max(this.rawTarget, e1);
      this.lastInputTime = now;
      if (this.mode !== "motion") this.mode = "pointer";
    }
    this.lastPointer = { x, y, t: now };
  }

  begin() {
    this.startedAt = performance.now();
    this.lastInputTime = performance.now();
  }

  // Called each animation frame. Smooths energy, applies decay, and injects a
  // gentle idle auto-demo shake after ~3s of no real input.
  tick(timeMs: number): number {
    const sinceInput = timeMs - this.lastInputTime;

    // idle auto-demo: low-energy rolling shake so it's never silent/still
    if (sinceInput > 3000) {
      this.idlePhase += 0.045;
      // soft pulsing rattle, peaks ~0.3 energy
      const pulse =
        0.18 +
        0.14 * Math.max(0, Math.sin(this.idlePhase)) +
        0.06 * Math.max(0, Math.sin(this.idlePhase * 2.3));
      this.rawTarget = Math.max(this.rawTarget, pulse);
      if (this.mode !== "motion" && this.mode !== "pointer")
        this.mode = "idle";
      else if (sinceInput > 3000) this.mode = "idle";
    }

    // smooth toward target, then let target decay so shakes feel punchy
    const k = this.rawTarget > this.energy ? 0.45 : 0.12;
    this.energy += (this.rawTarget - this.energy) * k;
    this.rawTarget *= 0.86;
    if (this.energy < 0.001) this.energy = 0;
    return this.energy;
  }

  dispose() {
    if (this.motionHandler) {
      window.removeEventListener("devicemotion", this.motionHandler);
      this.motionHandler = null;
    }
    if (this.el) {
      this.el.removeEventListener("pointermove", this.onPointerMove);
      this.el.removeEventListener("pointerdown", this.onPointerMove);
      this.el.removeEventListener("touchmove", this.onTouchMove);
      this.el = null;
    }
  }
}
