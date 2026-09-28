// Best-effort per-instance limiter; serverless instances don't share memory,
// so this only blunts bursts. Use a shared store (e.g. Redis) for real quotas.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return { ok: true, retryAfter: 0 };
}
