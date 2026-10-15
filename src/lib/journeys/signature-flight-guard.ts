/**
 * SIGNATURE FLIGHT GUARD (show day 2026-10-15, Karel: "i dont want the piano
 * flying"). A title-hold during Yellow Bird's opening flight left the shared
 * particle engine's flight pose set when the journey layer was torn down; the
 * title card's PIANO then formed in that engine and flew off along the bird's
 * path. By construction now:
 *   - a flight may only start / move motes while the worn image is THIS
 *     journey's own emblem for the flown occurrence, the layer is alive and
 *     the statement card does not own the engine (signatureFlightMayFly);
 *   - whenever the layer lets go of the engine (teardown, or the card taking
 *     it), the flight is ended (endSignatureFlight) — the next owner never
 *     inherits a pose.
 */
export interface FlightGuardState {
  /** what the image slot wears ("emblem" | "angel" | "motif" | "moment" | "echo" | null) */
  imgLoaded: string | null;
  /** which image exactly ("emblem:<occ>" for the journey's emblems) */
  imgKey: string | null;
  /** the emblem occurrence the flight belongs to (-1 = none) */
  flightOcc: number;
  /** the worn image is letting go */
  imgReleasing: boolean;
  /** the statement / title card (piano) owns the shared engine */
  cardHeld: boolean;
  /** the journey layer has released the engine */
  disposed: boolean;
}

export function signatureFlightMayFly(s: FlightGuardState): boolean {
  return (
    !s.disposed &&
    !s.cardHeld &&
    s.flightOcc >= 0 &&
    s.imgLoaded === "emblem" &&
    s.imgKey === `emblem:${s.flightOcc}` &&
    !s.imgReleasing
  );
}

/** End any flight pose on the engine (idempotent; never throws). */
export function endSignatureFlight(engine: { setImageFlight(f: null): void } | null | undefined): void {
  try { engine?.setImageFlight(null); } catch { /* engine gone */ }
}
