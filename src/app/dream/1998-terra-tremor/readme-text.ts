// Design-notes copy for the in-page modal. Kept as data so page.tsx stays lean.

export interface NoteBlock {
  heading: string;
  body: string;
}

export const DESIGN_NOTES: NoteBlock[] = [
  {
    heading: "The question",
    body: "What if the living planet itself played Resonance — every earthquake on Earth in the last day, right now, as a struck resonance inside a slow tectonic drone? This is sonification: music ABOUT the actual Earth, not a tune about nothing.",
  },
  {
    heading: "The data",
    body: "The USGS real-time feed (all_day.geojson) lists every quake worldwide in the last 24 hours — hundreds of them. We poll it about every 60s. Each event carries a magnitude, a place, a time, and a longitude / latitude / depth.",
  },
  {
    heading: "The mapping",
    body: "Magnitude → energy: bigger quakes are lower, louder and ring longer. Depth (km) → timbre: deep quakes are darker (a lower low-pass), shallow ones brighter. Longitude (−180..180) → stereo pan (−1..1), so the Pacific rim moves across the field. Every struck pitch snaps to the current mode.",
  },
  {
    heading: "The changing scale",
    body: "Under it all runs a deep tectonic drone whose fundamental slowly rises and thickens as the running rate of seismic-energy release climbs — a busier Earth hums harder. Its pitch material is a modal scale that DRIFTS to a new mode every ~40s. It is deliberately not a fixed just-intonation partial stack: the whole point is that the key turns over minutes.",
  },
  {
    heading: "Graceful fallback",
    body: "On any fetch / parse / CORS / offline error the piece switches to a synthetic Poisson quake generator whose magnitudes follow a Gutenberg–Richter exponential law (many tiny events, the rare violent one). A badge always says whether you are hearing LIVE Earth or a SIMULATED one — it never goes silent.",
  },
  {
    heading: "Metering",
    body: "A day holds hundreds of quakes, so we do not fire them all at once. The batch is replayed in time-order as a rhythmic stream, metered out over the poll window — the last day compressed into a listenable current of events.",
  },
  {
    heading: "Lineage",
    body: "Seismic sonification has a real history: USGS and IRIS have long published 'listening to earthquakes' audifications (seismograms sped up into the audible band), Florian Dombois framed the practice as Auditory Seismology, and Andrea Polli's geophysical sound work turned Earth data into installation sound. This piece sits in that lineage but treats each event as a struck note in a drifting mode rather than a raw audification.",
  },
  {
    heading: "Where a next cycle could go",
    body: "Real coastline geometry and plate boundaries; true moment-energy (10^1.5M) weighting per region so tectonic hot-spots swell the drone locally; a depth-axis camera; and a 'foreshock → mainshock → aftershock' listening mode that follows a single sequence through time.",
  },
];
