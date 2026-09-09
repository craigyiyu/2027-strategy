import { describe, expect, it } from 'vitest';
import { openDatabase, migrate } from '../../src/db';
import { Repo } from '../../src/repo';
import { FieldCipher, generateToken, sha256Hex, tokenEntropyBits } from '../../src/security';

function makeRepo() {
  const db = openDatabase();
  migrate(db);
  const cipher = new FieldCipher('', 'unit-test-secret-with-24-chars-min');
  return new Repo(db, cipher);
}

describe('tokens & hashing (SEC-02, SEC-005)', () => {
  it('generates high-entropy tokens and stores only hashes', () => {
    const repo = makeRepo();
    const token = generateToken(32);
    expect(tokenEntropyBits(token)).toBeGreaterThanOrEqual(128);
    const hash = sha256Hex(token);
    repo.createSession({
      tokenHash: hash,
      language: 'en',
      lens: 'technology',
      roleBand: 'c_suite',
      industryBand: 'integrated_resort_hospitality',
      privacyMode: 'private',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    // DB must not contain the raw token
    const rows = repo.db.prepare('SELECT public_token_hash FROM sessions').all() as Array<{ public_token_hash: string }>;
    expect(rows[0]!.public_token_hash).toBe(hash);
    const raw = repo.db.prepare('SELECT * FROM sessions').get() as Record<string, unknown>;
    expect(JSON.stringify(raw)).not.toContain(token);
  });

  it('has unique high-entropy tokens across 10k draws (SEC-005)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const t = generateToken(32);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });
});

describe('answer encryption at rest (SEC-06)', () => {
  it('stores ciphertext that is not the plaintext and decrypts correctly', () => {
    const repo = makeRepo();
    const token = generateToken(32);
    repo.createSession({
      tokenHash: sha256Hex(token),
      language: 'en',
      lens: 'technology',
      roleBand: 'c_suite',
      industryBand: 'integrated_resort_hospitality',
      privacyMode: 'private',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const sessionId = (repo.db.prepare('SELECT id FROM sessions LIMIT 1').get() as { id: string }).id;
    const secret = 'VeryConfidentialAnswer-2027-Platform-v1';
    const r = repo.upsertResponse({
      sessionId,
      stageId: 'Q1',
      kind: 'core',
      answer: secret,
      extractedJson: [],
      sensitivityState: 'clear',
      qualityLabel: 'sufficient',
    });
    const rawRow = repo.db
      .prepare('SELECT answer_ciphertext AS c FROM responses WHERE id = ?')
      .get(r.id) as { c: string };
    expect(rawRow.c).not.toContain(secret);
    const back = repo.readAnswerText(r);
    expect(back).toBe(secret);
  });
});
