import { notFound } from "next/navigation";
import { isOfflinePack } from "@/lib/offline/pack";
import { RemoteClient } from "./remote-client";

// Offline kiosk only — phone remote served over the hotspot LAN
// (http://<laptop-ip>:3000/remote). Online this 404s.
export const dynamic = "force-dynamic";

export default function RemotePage() {
  if (!isOfflinePack()) notFound();
  return <RemoteClient />;
}
