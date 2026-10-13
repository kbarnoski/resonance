import { notFound } from "next/navigation";
import { isOfflinePack } from "@/lib/offline/pack";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { RemoteClient } from "./remote-client";

// Offline kiosk only — phone remote served over the hotspot LAN
// (http://<laptop-ip>:3000/remote). Online this 404s.
export const dynamic = "force-dynamic";

export default function RemotePage() {
  if (!isOfflinePack()) notFound();
  // FAST FIRST PAINT (2026-10-13, "no delays"): the page arrives with the
  // kiosk's last status (its set + track lists) straight from the in-memory
  // bus — nothing to fetch before the lists show — and the DJ extras resolved
  // here, so the 256 KB journey registry never ships to the phone.
  const bus = (globalThis as { __packRemoteBus?: { status: Record<string, unknown> | null; statusAt: number } }).__packRemoteBus;
  const initialStatus = bus?.status ?? null;
  const initialAgeMs = bus?.status ? Date.now() - bus.statusAt : null;
  const extras = JOURNEYS.filter((j) => j.recordingId || PAIRED_TRACKS[j.id]).map((j) => ({ id: j.id, name: j.name }));
  return <RemoteClient initialStatus={initialStatus} initialAgeMs={initialAgeMs} extras={extras} />;
}
