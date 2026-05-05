-- Installation kiosk heartbeats.
--
-- Each running kiosk POSTs its current state to /api/installation/heartbeat
-- every 60s. The /installation/status page reads it back, letting an
-- operator verify the kiosk is healthy from a phone without going on-site.
--
-- Token-keyed: anyone with the token can read or write that row. The
-- token is the auth — it's a 16-byte hex string the operator generates
-- once and stamps into the kiosk URL (?heartbeat_token=...) and the
-- status URL (?token=...). No RLS check on the row itself; we lock
-- access at the API route by requiring the token in the request.

CREATE TABLE IF NOT EXISTS public.installation_heartbeats (
  token       text PRIMARY KEY,
  payload     jsonb NOT NULL,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.installation_heartbeats ENABLE ROW LEVEL SECURITY;

-- All reads + writes go through the API route using the service role
-- key. Anonymous + authenticated direct table access is blocked.
DROP POLICY IF EXISTS "installation_heartbeats_no_direct_access"
  ON public.installation_heartbeats;
CREATE POLICY "installation_heartbeats_no_direct_access"
  ON public.installation_heartbeats FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_installation_heartbeats_last_seen
  ON public.installation_heartbeats (last_seen DESC);
