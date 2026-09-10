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
  const apiKey = env.LLM_API_KEY || env.DEEPSEEK_API_KEY || env.MINIMAX_API_KEY || '';
  const opts: LlmProviderOptions = {
    apiKey: apiKey || undefined,
    baseUrl: env.LLM_BASE_URL,
    fastModel: env.LLM_FAST_MODEL,
    strongModel: env.LLM_STRONG_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxTokens: env.LLM_MAX_TOKENS,
    promptVersion: '2026-09-09.1',
  };
  switch (env.LLM_MODE) {
    case 'live':
      if (!apiKey) throw new Error('LLM_MODE=live requires LLM_API_KEY (or DEEPSEEK_API_KEY / MINIMAX_API_KEY)');
      return new LiveProvider(opts);
    case 'fake':
      return new FakeProvider(opts);
    case 'deterministic':
    default:
      return new DeterministicProvider();
  }
}

export type { LlmProvider };
