/*
 * 877 · BIOSPHERE SCORE — data layer
 *
 * GBIF occurrence search is keyless and CORS-open, so we fetch it directly
 * from the browser. The build/review environment is OFFLINE, so the fetch
 * WILL fail there — we ship a curated fallback set spanning many taxa and
 * regions, and the auto-demo runs entirely off that with zero network.
 */

export type Occurrence = {
  lat: number;
  lon: number;
  eventDate: string | null;
  kingdom: string | null;
  className: string | null; // GBIF "class" (reserved word in JS)
  scientificName: string;
  vernacularName: string | null;
  country: string | null;
};

const GBIF_URL =
  "https://api.gbif.org/v1/occurrence/search?hasCoordinate=true&hasGeospatialIssue=false&limit=300&eventDate=2026-05-01,2026-06-30";

type GbifResult = {
  decimalLatitude?: number;
  decimalLongitude?: number;
  eventDate?: string;
  kingdom?: string;
  class?: string;
  scientificName?: string;
  vernacularName?: string;
  country?: string;
};

function normalize(r: GbifResult): Occurrence | null {
  if (typeof r.decimalLatitude !== "number" || typeof r.decimalLongitude !== "number") {
    return null;
  }
  return {
    lat: r.decimalLatitude,
    lon: r.decimalLongitude,
    eventDate: r.eventDate ?? null,
    kingdom: r.kingdom ?? null,
    className: r.class ?? null,
    scientificName: r.scientificName ?? "Unknown sp.",
    vernacularName: r.vernacularName ?? null,
    country: r.country ?? null,
  };
}

/**
 * Fetch live GBIF occurrences. Returns null on any failure (offline, CORS,
 * empty) so the caller can fall back seamlessly. `signal` aborts in flight.
 */
export async function fetchOccurrences(
  signal: AbortSignal
): Promise<Occurrence[] | null> {
  try {
    const res = await fetch(GBIF_URL, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: GbifResult[] };
    if (!json.results || json.results.length === 0) return null;
    const out: Occurrence[] = [];
    for (const r of json.results) {
      const n = normalize(r);
      if (n) out.push(n);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Curated offline fallback. ~40 occurrences spanning birds, mammals, insects,
 * plants, fungi, amphibians, reptiles and fish across every continent. Used
 * when the live fetch fails or returns nothing — the demo always has data.
 */
export const FALLBACK_OCCURRENCES: Occurrence[] = [
  // Birds (Aves)
  { lat: -13.16, lon: -72.54, eventDate: "2026-05-04", kingdom: "Animalia", className: "Aves", scientificName: "Selasphorus rufus", vernacularName: "Rufous Hummingbird", country: "Peru" },
  { lat: 51.51, lon: -0.13, eventDate: "2026-05-07", kingdom: "Animalia", className: "Aves", scientificName: "Erithacus rubecula", vernacularName: "European Robin", country: "United Kingdom" },
  { lat: 35.68, lon: 139.69, eventDate: "2026-05-09", kingdom: "Animalia", className: "Aves", scientificName: "Corvus macrorhynchos", vernacularName: "Large-billed Crow", country: "Japan" },
  { lat: -33.87, lon: 151.21, eventDate: "2026-05-11", kingdom: "Animalia", className: "Aves", scientificName: "Cracticus tibicen", vernacularName: "Australian Magpie", country: "Australia" },
  { lat: 40.71, lon: -74.0, eventDate: "2026-05-13", kingdom: "Animalia", className: "Aves", scientificName: "Cardinalis cardinalis", vernacularName: "Northern Cardinal", country: "United States" },
  { lat: 0.18, lon: 37.91, eventDate: "2026-05-15", kingdom: "Animalia", className: "Aves", scientificName: "Tockus erythrorhynchus", vernacularName: "Red-billed Hornbill", country: "Kenya" },
  // Mammals (Mammalia)
  { lat: 60.17, lon: 24.94, eventDate: "2026-05-05", kingdom: "Animalia", className: "Mammalia", scientificName: "Vulpes vulpes", vernacularName: "Red Fox", country: "Finland" },
  { lat: -1.29, lon: 36.82, eventDate: "2026-05-08", kingdom: "Animalia", className: "Mammalia", scientificName: "Loxodonta africana", vernacularName: "African Bush Elephant", country: "Kenya" },
  { lat: 46.6, lon: 7.9, eventDate: "2026-05-12", kingdom: "Animalia", className: "Mammalia", scientificName: "Capra ibex", vernacularName: "Alpine Ibex", country: "Switzerland" },
  { lat: 29.65, lon: 91.13, eventDate: "2026-05-16", kingdom: "Animalia", className: "Mammalia", scientificName: "Pantholops hodgsonii", vernacularName: "Tibetan Antelope", country: "China" },
  { lat: 19.43, lon: -99.13, eventDate: "2026-05-19", kingdom: "Animalia", className: "Mammalia", scientificName: "Tadarida brasiliensis", vernacularName: "Mexican Free-tailed Bat", country: "Mexico" },
  { lat: 64.13, lon: -21.9, eventDate: "2026-05-22", kingdom: "Animalia", className: "Mammalia", scientificName: "Megaptera novaeangliae", vernacularName: "Humpback Whale", country: "Iceland" },
  // Insects (Insecta)
  { lat: -1.29, lon: 36.82, eventDate: "2026-05-06", kingdom: "Animalia", className: "Insecta", scientificName: "Apis mellifera", vernacularName: "Honey Bee", country: "Kenya" },
  { lat: 45.76, lon: 4.84, eventDate: "2026-05-10", kingdom: "Animalia", className: "Insecta", scientificName: "Pieris rapae", vernacularName: "Small White Butterfly", country: "France" },
  { lat: 25.28, lon: 51.52, eventDate: "2026-05-14", kingdom: "Animalia", className: "Insecta", scientificName: "Anax imperator", vernacularName: "Emperor Dragonfly", country: "Qatar" },
  { lat: -23.55, lon: -46.63, eventDate: "2026-05-17", kingdom: "Animalia", className: "Insecta", scientificName: "Atta sexdens", vernacularName: "Leafcutter Ant", country: "Brazil" },
  { lat: 52.52, lon: 13.4, eventDate: "2026-05-21", kingdom: "Animalia", className: "Insecta", scientificName: "Coccinella septempunctata", vernacularName: "Seven-spot Ladybird", country: "Germany" },
  { lat: 14.6, lon: 120.98, eventDate: "2026-05-24", kingdom: "Animalia", className: "Insecta", scientificName: "Gryllus bimaculatus", vernacularName: "Field Cricket", country: "Philippines" },
  // Plants (Plantae)
  { lat: 35.01, lon: 135.77, eventDate: "2026-05-03", kingdom: "Plantae", className: "Magnoliopsida", scientificName: "Prunus serrulata", vernacularName: "Japanese Cherry", country: "Japan" },
  { lat: -34.6, lon: -58.38, eventDate: "2026-05-18", kingdom: "Plantae", className: "Magnoliopsida", scientificName: "Jacaranda mimosifolia", vernacularName: "Jacaranda", country: "Argentina" },
  { lat: 37.98, lon: 23.73, eventDate: "2026-05-20", kingdom: "Plantae", className: "Magnoliopsida", scientificName: "Olea europaea", vernacularName: "Olive Tree", country: "Greece" },
  { lat: 1.35, lon: 103.82, eventDate: "2026-05-23", kingdom: "Plantae", className: "Magnoliopsida", scientificName: "Nelumbo nucifera", vernacularName: "Sacred Lotus", country: "Singapore" },
  { lat: 27.99, lon: 86.93, eventDate: "2026-05-25", kingdom: "Plantae", className: "Pinopsida", scientificName: "Rhododendron arboreum", vernacularName: "Tree Rhododendron", country: "Nepal" },
  // Fungi
  { lat: 59.91, lon: 10.75, eventDate: "2026-05-02", kingdom: "Fungi", className: "Agaricomycetes", scientificName: "Amanita muscaria", vernacularName: "Fly Agaric", country: "Norway" },
  { lat: 48.86, lon: 2.35, eventDate: "2026-05-26", kingdom: "Fungi", className: "Agaricomycetes", scientificName: "Cantharellus cibarius", vernacularName: "Golden Chanterelle", country: "France" },
  { lat: 45.42, lon: -75.7, eventDate: "2026-05-28", kingdom: "Fungi", className: "Agaricomycetes", scientificName: "Pleurotus ostreatus", vernacularName: "Oyster Mushroom", country: "Canada" },
  { lat: -41.29, lon: 174.78, eventDate: "2026-05-30", kingdom: "Fungi", className: "Agaricomycetes", scientificName: "Entoloma hochstetteri", vernacularName: "Sky-blue Mushroom", country: "New Zealand" },
  // Amphibians (Amphibia)
  { lat: -27.47, lon: 153.03, eventDate: "2026-06-01", kingdom: "Animalia", className: "Amphibia", scientificName: "Litoria caerulea", vernacularName: "Green Tree Frog", country: "Australia" },
  { lat: 4.71, lon: -74.07, eventDate: "2026-06-03", kingdom: "Animalia", className: "Amphibia", scientificName: "Dendrobates truncatus", vernacularName: "Yellow-striped Poison Frog", country: "Colombia" },
  { lat: 50.11, lon: 8.68, eventDate: "2026-06-05", kingdom: "Animalia", className: "Amphibia", scientificName: "Bufo bufo", vernacularName: "Common Toad", country: "Germany" },
  // Reptiles (Reptilia)
  { lat: -0.95, lon: -90.97, eventDate: "2026-06-07", kingdom: "Animalia", className: "Reptilia", scientificName: "Amblyrhynchus cristatus", vernacularName: "Marine Iguana", country: "Ecuador" },
  { lat: 27.17, lon: 78.04, eventDate: "2026-06-09", kingdom: "Animalia", className: "Reptilia", scientificName: "Naja naja", vernacularName: "Indian Cobra", country: "India" },
  { lat: 30.27, lon: -97.74, eventDate: "2026-06-11", kingdom: "Animalia", className: "Reptilia", scientificName: "Sceloporus olivaceus", vernacularName: "Texas Spiny Lizard", country: "United States" },
  // Fish (Actinopterygii)
  { lat: 21.31, lon: -157.86, eventDate: "2026-06-13", kingdom: "Animalia", className: "Actinopterygii", scientificName: "Zebrasoma flavescens", vernacularName: "Yellow Tang", country: "United States" },
  { lat: -8.34, lon: 115.09, eventDate: "2026-06-15", kingdom: "Animalia", className: "Actinopterygii", scientificName: "Amphiprion ocellaris", vernacularName: "Clownfish", country: "Indonesia" },
  { lat: 55.95, lon: -3.19, eventDate: "2026-06-17", kingdom: "Animalia", className: "Actinopterygii", scientificName: "Salmo salar", vernacularName: "Atlantic Salmon", country: "United Kingdom" },
  { lat: 25.76, lon: -80.19, eventDate: "2026-06-19", kingdom: "Animalia", className: "Actinopterygii", scientificName: "Megalops atlanticus", vernacularName: "Atlantic Tarpon", country: "United States" },
  // A few more birds/insects to weight the busier sections
  { lat: 6.52, lon: 3.38, eventDate: "2026-06-21", kingdom: "Animalia", className: "Aves", scientificName: "Pycnonotus barbatus", vernacularName: "Common Bulbul", country: "Nigeria" },
  { lat: 59.33, lon: 18.07, eventDate: "2026-06-23", kingdom: "Animalia", className: "Aves", scientificName: "Cyanistes caeruleus", vernacularName: "Eurasian Blue Tit", country: "Sweden" },
  { lat: -22.91, lon: -43.17, eventDate: "2026-06-24", kingdom: "Animalia", className: "Insecta", scientificName: "Morpho menelaus", vernacularName: "Blue Morpho", country: "Brazil" },
];
