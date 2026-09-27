"use client";

import { Component, type ReactNode } from "react";

/**
 * Imagery error boundary (maturity audit 2026-09-26 #8). The AI collage,
 * video layers, depth parallax, clones and trails were all rewritten in
 * September; an uncaught throw in any of them must NEVER take a
 * 65-minute unattended show to an error screen. This boundary drops the
 * imagery stack and lets the shader stack carry the show — degraded,
 * alive, and it logs to the flight recorder so the morning report shows
 * exactly when and what.
 *
 * It retries the imagery once per journey (reset via `resetKey`), so a
 * transient throw doesn't disable imagery for the whole night.
 */
export class ImageryErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { failed: boolean }
> {
  state = { failed: false };
  private lastResetKey: string | undefined;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[Resonance] imagery stack crashed — degrading to shaders:", error);
    try {
      fetch("/api/pack/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: `imagery-crash ${String(error?.message ?? error).slice(0, 300)}` }),
      }).catch(() => { /* recorder offline — console has it */ });
    } catch { /* never rethrow from the boundary */ }
  }

  componentDidUpdate() {
    // New journey → give the imagery stack one fresh chance.
    if (this.state.failed && this.props.resetKey !== this.lastResetKey) {
      this.lastResetKey = this.props.resetKey;
      this.setState({ failed: false });
    } else {
      this.lastResetKey = this.props.resetKey;
    }
  }

  render() {
    if (this.state.failed) return null; // shaders carry the show
    return this.props.children;
  }
}
