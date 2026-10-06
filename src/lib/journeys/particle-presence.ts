/**
 * Tiny cross-component store: is the particle lead PRESENT right now?
 * The ParticleLeadLayer (inside JourneyCompositor) writes it; the shader
 * stack's owners read it to drop the dual/tertiary support shaders only
 * while particles actually lead (perf budget + legibility) — the shader
 * stack is untouched the rest of the time. Hysteresis lives in the writer.
 */
let present = false;
const listeners = new Set<() => void>();

export function setParticlePresent(v: boolean): void {
  if (v === present) return;
  present = v;
  for (const l of listeners) l();
}
export function getParticlePresent(): boolean {
  return present;
}
export function subscribeParticlePresent(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
