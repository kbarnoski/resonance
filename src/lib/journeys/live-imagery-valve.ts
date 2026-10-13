/**
 * LIVE IMAGERY VALVE — the one switch for every live (fal) image request.
 *
 * Karel 2026-10-13: "fix the code base so no request for live images from the
 * local app is being made although one day i may enable it so its like a shut
 * down of a valve." The local app (the Tramokyo kiosk build) shows only its
 * packed imagery: with the valve closed nothing in the client asks for a live
 * image (status probe, realtime token, websocket, REST generate, the Ghost
 * reference gens) — no request leaves the page at all.
 *
 * CLOSED when the build sets NEXT_PUBLIC_LIVE_IMAGERY=off (scripts/kiosk-deploy.sh
 * does, for the kiosk). The web app leaves it unset → open, as before.
 * To reopen it on the kiosk one day: set NEXT_PUBLIC_LIVE_IMAGERY=on in
 * scripts/kiosk-deploy.sh AND RESONANCE_LIVE_IMAGERY=on in scripts/tramokyo-server.sh
 * (the server half: /api/ai-image/* refuse on the kiosk unless it is on), then deploy.
 */
export const LIVE_IMAGERY_OPEN: boolean = process.env.NEXT_PUBLIC_LIVE_IMAGERY !== "off";

export function liveImageryOpen(): boolean {
  return LIVE_IMAGERY_OPEN;
}
