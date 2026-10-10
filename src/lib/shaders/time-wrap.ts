/**
 * Periodic-time WRAP ENVELOPE (kiosk film 2026-10-10: supernova's big
 * shockwave ring vanished in ONE frame while a tiny new ring appeared at
 * the centre; elsewhere the whole frame's darks stepped ±3/255 in one
 * frame — dim glow terms tied to fract()/mod() cycles resetting).
 *
 * Any element driven by a periodic phase — `fract(u_time * k + o)`,
 * `mod(t, P)` — jumps from its end state back to its start state when the
 * phase wraps. Unless the element is at zero on both sides of the wrap,
 * the picture changes in one frame.
 *
 * `rsWrapEnv(ph)` takes a 0..1 phase to an envelope that is 0 at both ends
 * (quick fade-in over the first `RS_WRAP_IN` of the cycle, fade-out over
 * the last `1 - RS_WRAP_OUT`). Multiply the cycling element's brightness
 * (not its position) by it so the wrap happens while it is invisible.
 * `rsWrapEnvK(ph, a, b)` sets the fade widths explicitly.
 *
 * Audit: scripts/audit-shader-time-wraps.mjs renders every registered
 * shader at 30 fps over 150 s and flags one-frame discontinuities. The
 * regression lint lives in time-wrap.test.ts.
 */
export const RS_WRAP_ENV = `
float rsWrapEnvK(float ph, float fin, float fout) {
  // (edge0 < edge1 always: reversed smoothstep edges are undefined in GLSL ES)
  return smoothstep(0.0, fin, ph) * (1.0 - smoothstep(fout, 1.0, ph));
}
float rsWrapEnv(float ph) { return rsWrapEnvK(ph, 0.08, 0.85); }
`;
