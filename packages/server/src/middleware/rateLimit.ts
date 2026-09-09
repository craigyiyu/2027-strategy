/**
 * Lightweight in-memory sliding-window rate limiter (SEC-03) with a DB-backed
 * idempotency table for mutations. Single-instance private beta: in-memory is
 * acceptable; documented for multi-instance deployments.
 */
import { Repo } from '../repo';
import { logger } from '../logger';

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { hits: [] };
    buckets.set(key, b);
  }
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    const oldest = b.hits[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  b.hits.push(now);
  return { ok: true, retryAfterSeconds: 0 };
}

/** Memory-bounded cleanup so the map cannot grow unboundedly. */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < 3600_000);
    if (b.hits.length === 0) buckets.delete(k);
  }
}, 60_000).unref();

/** Idempotency registry backed by sessions.ids as unique keys via a table. */
export class Idempotency {
  private seen = new Map<string, { key: string; at: number }>();

  constructor(private repo: Repo) {
    // ensure table exists
    this.repo.db.exec(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY, session_id TEXT, created_at TEXT)`,
    );
  }

  /**
   * Returns the stored payload for the key if already executed, else claims
   * the key. Caller executes exactly once per key.
   */
  tryClaim(key: string, sessionId: string): { first: true } | { first: false } {
    const existing = this.repo.db
      .prepare('SELECT id FROM idempotency_keys WHERE id = ?')
      .get(key);
    if (existing) return { first: false };
    try {
      this.repo.db
        .prepare('INSERT INTO idempotency_keys (id, session_id, created_at) VALUES (?,?,?)')
        .run(key, sessionId, new Date().toISOString());
      return { first: true };
    } catch {
      // race: another request claimed it
      return { first: false };
    }
  }

  sweep() {
    this.seen.clear();
  }
}

export { logger };
