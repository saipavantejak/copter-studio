// SeededRandom.ts — Mulberry32 seeded PRNG
// Replaces Math.random() throughout the sim for full reproducibility.
// Same seed → identical episode, every time.
//
// Usage:
//   const rng = new SeededRandom(42);
//   rng.next();        // 0–1 uniform
//   rng.nextGaussian() // Box-Muller Gaussian
//   rng.fork(i)        // deterministic child RNG for episode i

export class SeededRandom {
  private state: number;

  constructor(seed: number = Date.now()) {
    // Ensure 32-bit positive integer seed
    this.state = (seed >>> 0) || 1;
  }

  /** Advance state and return uniform [0, 1) */
  next(): number {
    let z = (this.state += 0x6D2B79F5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    return z;
  }

  /** Box-Muller: standard normal N(0,1) */
  nextGaussian(): number {
    const u = this.next() + 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Uniform in [lo, hi) */
  uniform(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Gaussian with mean μ and std σ */
  gaussian(mu: number, sigma: number): number {
    return mu + this.nextGaussian() * sigma;
  }

  /** Fork a deterministic child RNG for episode index i */
  fork(i: number): SeededRandom {
    return new SeededRandom(this.state ^ (i * 0x9E3779B9 + 0x6C62272E));
  }

  /** Clone current state */
  clone(): SeededRandom {
    return new SeededRandom(this.state);
  }

  /** Current state (for saving / restoring) */
  getState(): number { return this.state; }
  setState(s: number): void { this.state = s >>> 0; }
}

/** Global shared RNG — seeded at startup. Reset to reproduce runs. */
export const globalRng = new SeededRandom(42);
