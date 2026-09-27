// geometry.test.ts — DOM-free self-test for the Echo Halls (Sphere) math.
//
// Deliberately uses NO test framework: `runSelfTest()` is a plain function that
// throws on the first failed assertion and logs a PASS/FAIL summary. This keeps
// the prototype self-contained (the repo's vitest runner is scoped to src/lib/**,
// so this co-located file is not auto-run by `npm test`).
//
// Run ad hoc with either:
//   npx tsx src/app/dream/1029-echo-halls-sphere/geometry.test.ts
//   npx vitest run --root . src/app/dream/1029-echo-halls-sphere   (vitest wrapper below)

import {
  C_MAJOR_PCS,
  Vec3,
  angularDistance,
  chordFreqs,
  facedRoomIndex,
  facingWeights,
  forwardFromYawPitch,
  length,
  roomSpherePositions,
} from "./geometry";

let passCount = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  passCount++;
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

export function runSelfTest(): { pass: number } {
  passCount = 0;
  const rooms = roomSpherePositions();

  // 1. Exactly six rooms, all of distinct chord functions.
  assert(rooms.length === 6, "there are 6 rooms");
  assert(new Set(rooms.map((r) => r.id)).size === 6, "all 6 chord functions distinct");

  // 2. Every room direction is a unit vector.
  for (const r of rooms) {
    assert(approx(length(r.dir), 1, 1e-6), `room ${r.id} dir is unit length`);
  }

  // 3. Full-sphere spread: not coplanar — at least one clearly ABOVE (y>0.4)
  //    and one clearly BELOW (y<-0.4), plus at least one BEHIND (z>0.3).
  const ys = rooms.map((r) => r.dir[1]);
  assert(ys.some((y) => y > 0.4), "at least one room is high above (y>0.4)");
  assert(ys.some((y) => y < -0.4), "at least one room is low below (y<-0.4)");
  assert(rooms.some((r) => r.dir[2] > 0.3), "at least one room is behind (z>0.3)");

  // 4. No two rooms occupy nearly the same direction (well separated).
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const sep = angularDistance(rooms[i].dir, rooms[j].dir);
      assert(sep > 0.35, `rooms ${rooms[i].id}/${rooms[j].id} are separated (${sep.toFixed(2)} rad)`);
    }
  }

  // 5. facingWeights sums to ~1 and peaks at the room being faced.
  for (const r of rooms) {
    const w = facingWeights(r.dir, rooms);
    const sum = w.reduce((a, b) => a + b, 0);
    assert(approx(sum, 1, 1e-9), `facingWeights sums to 1 facing ${r.id}`);
    const maxIdx = w.indexOf(Math.max(...w));
    const faced = rooms.findIndex((x) => x.id === r.id);
    assert(maxIdx === faced, `facingWeights peaks at faced room ${r.id}`);
    assert(maxIdx === facedRoomIndex(r.dir, rooms), `facedRoomIndex agrees for ${r.id}`);
  }

  // 6. Every chord's pitch classes lie in the C-major scale tone set.
  const scale = new Set(C_MAJOR_PCS);
  for (const r of rooms) {
    assert(r.pcs.length === 3, `room ${r.id} is a triad`);
    for (const pc of r.pcs) {
      assert(scale.has(((pc % 12) + 12) % 12), `room ${r.id} pc ${pc} is diatonic to C major`);
    }
  }

  // 7. Chord frequencies fold into a warm low band (~65–235 Hz).
  for (const r of rooms) {
    const fs = chordFreqs(r.pcs);
    for (const f of fs) {
      assert(f >= 60 && f <= 240, `room ${r.id} freq ${f.toFixed(1)}Hz is in warm low band`);
    }
  }

  // 8. forwardFromYawPitch sanity: yaw0/pitch0 faces the tonic (down -z).
  const f0 = forwardFromYawPitch(0, 0);
  assert(approx(f0[2], -1, 1e-6) && approx(f0[1], 0, 1e-6), "yaw0/pitch0 looks down -z");
  const tonicIdx = rooms.findIndex((r) => r.id === "I");
  assert(facedRoomIndex(f0, rooms) === tonicIdx, "at rest you face the tonic (I)");
  // Pitching up looks above the horizon.
  const up = forwardFromYawPitch(0, 0.5) as Vec3;
  assert(up[1] > 0, "pitching up raises the forward vector");

  console.log(`geometry self-test: ${passCount} assertions PASSED`);
  return { pass: passCount };
}

// Auto-run when executed directly via tsx/node (not when imported by the app).
// We probe for a CommonJS-ish runtime without assigning to `module`.
const g = globalThis as {
  process?: { argv?: string[]; exitCode?: number };
};
if (g.process?.argv?.some((a) => a.includes("geometry.test"))) {
  try {
    runSelfTest();
  } catch (e) {
    console.error(String(e));
    if (g.process) g.process.exitCode = 1;
  }
}
