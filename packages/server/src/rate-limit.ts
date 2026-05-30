type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  consume(key: string, now: number = Date.now()): { allowed: boolean; resetAt: number; remaining: number } {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    const allowed = bucket.count <= this.max;
    return { allowed, resetAt: bucket.resetAt, remaining: Math.max(0, this.max - bucket.count) };
  }

  sweep(now: number = Date.now()): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
