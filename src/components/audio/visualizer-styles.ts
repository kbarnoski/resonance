/**
 * Module-level style constants shared across the visualizer.
 *
 * These were inline in visualizer-client.tsx in 17+ places; lifting
 * them here means each style object is allocated once at module load
 * (no per-render cost) and a future visual change is a single edit.
 *
 * Kept as a separate module rather than inline in visualizer-client
 * to make the 2500-line file slightly less daunting and so a Storybook
 * / test rig can pull just the styles without the React component.
 */
import type React from "react";

/** Geist Mono label in 0.9rem. Used for primary mono labels. */
export const MONO_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.9rem",
  color: "rgba(255, 255, 255, 0.85)",
  letterSpacing: "0.04em",
  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
};

/** Dimmer mono label, smaller, uppercase. Used for "secondary" tags. */
export const MONO_LABEL_DIM: React.CSSProperties = {
  ...MONO_LABEL,
  color: "rgba(255, 255, 255, 0.4)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

/** Hero serif title style — Cormorant Garamond. */
export const SERIF_TITLE: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  letterSpacing: "0.04em",
  color: "#fff",
  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
};

/** Soft radial-gradient backdrop for floating overlay text — used to
 *  ensure legibility against bright shaders. blur(40px) makes the edge
 *  feathered, so it doesn't read as a "card". */
export const OVERLAY_BG: React.CSSProperties = {
  position: "absolute",
  inset: "-40%",
  background:
    "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, transparent 65%)",
  filter: "blur(40px)",
  pointerEvents: "none",
};
