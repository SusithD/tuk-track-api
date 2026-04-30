/** Tiny deterministic PRNG (mulberry32) so re-seeding produces identical data. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function floatBetween(rng, min, max) {
  return rng() * (max - min) + min;
}
