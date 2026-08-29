"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PrototypeNav } from "../_shared/prototype-nav";

/** Client-side loader for the floating prev/next prototype nav.
 *
 *  Prototype pages render dynamically (no build-time fs available in the
 *  server render), so the ordered slug list comes from the static
 *  /dream/archive/manifest route — generated at build, CDN-cached, fetched
 *  once per session and only when actually standing on a prototype page. */
export function ManifestNav() {
  const pathname = usePathname() ?? "";
  const onPrototype = /^\/dream\/\d+-/.test(pathname);
  const [slugs, setSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    if (!onPrototype || slugs !== null) return;
    let alive = true;
    fetch("/dream/archive/manifest")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { slugs?: unknown } | null) => {
        if (alive && data && Array.isArray(data.slugs)) {
          setSlugs(data.slugs as string[]);
        }
      })
      .catch(() => {
        // Nav is an enhancement — a failed fetch just leaves it hidden.
      });
    return () => {
      alive = false;
    };
  }, [onPrototype, slugs]);

  if (!onPrototype || slugs === null) return null;
  return <PrototypeNav slugs={slugs} />;
}
