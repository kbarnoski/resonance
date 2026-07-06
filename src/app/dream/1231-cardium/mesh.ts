// mesh.ts — geodesic icosphere generator for 1231-cardium.
//
// Builds a subdivided icosahedron projected onto the unit sphere and derives
// the per-vertex neighbour adjacency (a CSR-style flat list) that the
// FitzHugh–Nagumo excitable medium diffuses across. A closed 3D surface with
// no boundary is exactly what lets depolarisation waves wrap all the way
// around and re-enter themselves — the pre-condition for genuine reentry.

export interface IcoSphere {
  /** Flat xyz positions on the unit sphere, length = count * 3. */
  positions: Float32Array
  /** Triangle indices into the vertex list, length = faceCount * 3. */
  indices: Uint32Array
  /** Vertex count. */
  count: number
  /** neighbourStart[i]..neighbourStart[i+1] slices neighbourList for vertex i. */
  neighbourStart: Uint32Array
  /** Flattened neighbour vertex indices. */
  neighbourList: Uint32Array
}

type V3 = [number, number, number]

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

// Build the 12 base icosahedron vertices and 20 faces.
function baseIcosahedron(): { verts: V3[]; faces: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => normalize(v as V3))

  const faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return { verts, faces }
}

/**
 * Generate an icosphere. subdivisions=4 -> 2562 vertices / 5120 faces, a good
 * balance of wave resolution and simulation cost for the browser.
 */
export function makeIcoSphere(subdivisions = 4): IcoSphere {
  const { verts, faces } = baseIcosahedron()
  const points: V3[] = verts.slice()
  let tris = faces.slice()
  const midCache = new Map<number, number>()

  const midpoint = (a: number, b: number): number => {
    const key = a < b ? a * 1_000_000 + b : b * 1_000_000 + a
    const cached = midCache.get(key)
    if (cached !== undefined) return cached
    const pa = points[a]
    const pb = points[b]
    const m = normalize([
      (pa[0] + pb[0]) / 2,
      (pa[1] + pb[1]) / 2,
      (pa[2] + pb[2]) / 2,
    ])
    const idx = points.length
    points.push(m)
    midCache.set(key, idx)
    return idx
  }

  for (let s = 0; s < subdivisions; s++) {
    const next: [number, number, number][] = []
    for (const [a, b, c] of tris) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    tris = next
  }

  const count = points.length
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = points[i][0]
    positions[i * 3 + 1] = points[i][1]
    positions[i * 3 + 2] = points[i][2]
  }

  const indices = new Uint32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    indices[i * 3] = tris[i][0]
    indices[i * 3 + 1] = tris[i][1]
    indices[i * 3 + 2] = tris[i][2]
  }

  // Build symmetric adjacency from the triangle edges.
  const neigh: Set<number>[] = Array.from({ length: count }, () => new Set<number>())
  for (const [a, b, c] of tris) {
    neigh[a].add(b); neigh[a].add(c)
    neigh[b].add(a); neigh[b].add(c)
    neigh[c].add(a); neigh[c].add(b)
  }

  const neighbourStart = new Uint32Array(count + 1)
  let total = 0
  for (let i = 0; i < count; i++) {
    neighbourStart[i] = total
    total += neigh[i].size
  }
  neighbourStart[count] = total
  const neighbourList = new Uint32Array(total)
  let w = 0
  for (let i = 0; i < count; i++) {
    for (const j of neigh[i]) neighbourList[w++] = j
  }

  return { positions, indices, count, neighbourStart, neighbourList }
}

/** Index of the vertex nearest to a given direction (used to place pace/listen nodes). */
export function nearestVertex(mesh: IcoSphere, dir: V3): number {
  const d = normalize(dir)
  let best = 0
  let bestDot = -Infinity
  const { positions, count } = mesh
  for (let i = 0; i < count; i++) {
    const dot = positions[i * 3] * d[0] + positions[i * 3 + 1] * d[1] + positions[i * 3 + 2] * d[2]
    if (dot > bestDot) { bestDot = dot; best = i }
  }
  return best
}
