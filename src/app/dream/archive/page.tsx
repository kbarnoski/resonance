import { redirect } from "next/navigation";

// /dream/archive has no content of its own — the archive lives at
// /dream/archive/1..N. Renders under the dream layout's force-dynamic
// default, so this is a tiny request-time redirect.
export default function DreamArchiveIndex() {
  redirect("/dream/archive/1");
}
