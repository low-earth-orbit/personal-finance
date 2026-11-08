/**
 * Seeded random numbers shared by every Monte Carlo tool (rent-vs-buy, retirement, glide-path).
 *
 * A fixed seed makes identical inputs produce identical results — no jitter between renders,
 * and smooth motion when a single field is nudged (each run consumes the same random stream).
 * The glide-path numbers won't match the Python engine's PCG64 exactly, but are statistically
 * equivalent.
 */

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard-normal draw via Box–Muller (cosine branch) from the supplied uniform source. */
export function standardNormal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Fill a flat Float64Array of `length` standard normals from `seed`, two at a time
 * via Box–Muller. The caller indexes it as a (rows × cols) matrix at `[i * cols + p]`.
 */
export function fillNormals(seed: number, length: number): Float64Array {
  const rand = mulberry32(seed);
  const out = new Float64Array(length);
  for (let i = 0; i < length; i += 2) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    out[i] = mag * Math.cos(2 * Math.PI * u2);
    if (i + 1 < length) out[i + 1] = mag * Math.sin(2 * Math.PI * u2);
  }
  return out;
}
