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
 * CLOSED when
 *   • the build sets NEXT_PUBLIC_LIVE_IMAGERY=off (scripts/kiosk-deploy.sh does), or
 *   • the page is served by the LOCAL APP at runtime, whatever the build flag
 *     (lab 2026-10-13: a build without the flag on the local server sent seven
 *     live-image requests the server half refused with 503):
 *       – the server marked the page (KIOSK_NO_LIVE_IMAGERY_ATTR — the
 *         installation page renders it whenever OFFLINE_PACK=1), or
 *       – the offline-pack probe has confirmed the local pack.
 * NEXT_PUBLIC_LIVE_IMAGERY=on forces it OPEN (with RESONANCE_LIVE_IMAGERY=on in
 * scripts/tramokyo-server.sh for the server half) — the way to reopen it one day.
 * The web app leaves the flag unset → open, as before.
 */
import { isPackActive } from "@/lib/offline/pack-client";

const FLAG = process.env.NEXT_PUBLIC_LIVE_IMAGERY;
export const LIVE_IMAGERY_OPEN: boolean = FLAG !== "off";

/** Attribute the local app's server-rendered pages carry (read before any client code runs). */
export const KIOSK_NO_LIVE_IMAGERY_ATTR = "data-resonance-no-live-imagery";

let localSeen = false;
function onLocalApp(): boolean {
  if (localSeen) return true;
  try {
    if (isPackActive()) return (localSeen = true);
    if (typeof document !== "undefined" && document.querySelector(`[${KIOSK_NO_LIVE_IMAGERY_ATTR}]`)) return (localSeen = true);
  } catch { /* no DOM */ }
  return false;
}

export function liveImageryOpen(): boolean {
  if (FLAG === "on") return true;
  if (!LIVE_IMAGERY_OPEN) return false;
  return !onLocalApp();
}
