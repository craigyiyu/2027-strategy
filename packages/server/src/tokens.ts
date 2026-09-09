/**
 * Token service: generate session/report/delete tokens, hash for storage,
 * expiry computation per privacy mode.
 */
import type { PrivacyMode } from '@2027strategy/shared';
import type { AppEnv } from './env';
import { generateToken, sha256Hex } from './security';

export interface IssueToken {
  token: string; // given to the client (never stored raw)
  hash: string; // stored
}

export function issueToken(): IssueToken {
  const token = generateToken(32); // 256-bit
  return { token, hash: sha256Hex(token) };
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export function computeExpiry(privacyMode: PrivacyMode, env: AppEnv): string {
  const now = Date.now();
  const hours = privacyMode === 'private' ? env.RETENTION_PRIVATE_HOURS : env.RETENTION_SAVED_DAYS * 24;
  return new Date(now + hours * 3600_000).toISOString();
}

export function reportExpiry(env: AppEnv): string {
  return new Date(Date.now() + env.RETENTION_REPORT_MONTHS * 30 * 24 * 3600_000).toISOString();
}
