/** 2027 Strategy server entry — load env, open DB, wire services, serve. */
import { serve } from '@hono/node-server';
import { loadEnv } from './env';
import { openDatabase, migrate } from './db';
import { Repo } from './repo';
import { FieldCipher } from './security';
import { Orchestrator } from './orchestrator';
import { AdminService } from './services/admin';
import { AnalyticsService } from './services/analytics';
import { ConsoleEmailProvider } from './email/providers';
import { createLlmProvider } from './llm';
import { createApp } from './app';
import { logger } from './logger';

const env = loadEnv();
const db = openDatabase(
  process.env.DATABASE_PATH ?? (env.NODE_ENV === 'test' ? ':memory:' : 'data/2027-strategy.sqlite'),
);
migrate(db);
const cipher = new FieldCipher(env.ENCRYPTION_KEY, env.APP_SECRET);
const repo = new Repo(db, cipher);
const llm = createLlmProvider(env);
const orchestrator = new Orchestrator(repo, llm);
const admin = new AdminService(repo, env.PULSE_MIN_CELL);
const analytics = new AnalyticsService(repo);
const email = new ConsoleEmailProvider(env);
const app = createApp({ repo, orchestrator, admin, analytics, email, env });

if (env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info('server', `2027 Strategy API listening on :${info.port} (LLM_MODE=${env.LLM_MODE}, EMAIL=${env.EMAIL_PROVIDER})`);
  });
}

/** Retention sweep (PRIV-012): periodically purge expired sessions by mode. */
function startRetentionSweep() {
  const sweep = () => {
    const now = new Date().toISOString();
    const privateIds = repo.listExpiredBefore(now, 'private');
    const savedIds = repo.listExpiredBefore(now, 'save');
    for (const id of [...privateIds, ...savedIds]) {
      const s = repo.getSessionById(id);
      if (s && s.status !== 'deleted') {
        repo.deleteSession(id);
        logger.info('retention', 'purged expired session', { session: id.slice(0, 8), mode: s.privacy_mode });
      }
    }
  };
  sweep();
  setInterval(sweep, 6 * 3600_000).unref();
}
if (env.NODE_ENV !== 'test') startRetentionSweep();

export { app, env, repo, orchestrator, admin, analytics, email };
