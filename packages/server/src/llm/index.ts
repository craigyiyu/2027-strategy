/**
 * LLM provider factory — picks live / fake / deterministic by config.
 * The orchestrator layer uses these via one interface.
 */
import type { AppEnv } from '../env';
import type { LlmProvider, LlmProviderOptions } from './types';
import { DeterministicProvider } from './deterministic';
import { FakeProvider } from './fake';
import { LiveProvider } from './live';

export type LlmMode = AppEnv['LLM_MODE'];

export function createLlmProvider(env: AppEnv): LlmProvider {
  const opts: LlmProviderOptions = {
    apiKey: env.DEEPSEEK_API_KEY || undefined,
    baseUrl: env.LLM_BASE_URL,
    fastModel: env.LLM_FAST_MODEL,
    strongModel: env.LLM_STRONG_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    promptVersion: '2026-09-09.1',
  };
  switch (env.LLM_MODE) {
    case 'live':
      if (!env.DEEPSEEK_API_KEY) throw new Error('LLM_MODE=live requires DEEPSEEK_API_KEY');
      return new LiveProvider(opts);
    case 'fake':
      return new FakeProvider(opts);
    case 'deterministic':
    default:
      return new DeterministicProvider();
  }
}

export type { LlmProvider };
