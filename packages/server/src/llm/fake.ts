/**
 * Fake provider for CI — deterministic fixtures incl. failure modes
 * (invalid JSON, timeout, empty, omit-field) and an injection scenario.
 * Never requires live model credits.
 */
import type { AssessAnswerOutput, ReflectionOutput, ReportOutput } from '@2027strategy/shared';
import type { AssessContext, LlmProviderOptions, ReflectContext, ReportContext } from './types';
import { DeterministicProvider } from './deterministic';

export class FakeProvider {
  readonly meta = { modelId: 'fake-adapter', promptVersion: 'fake-1.0', provider: 'fake' } as const;
  private behavior: NonNullable<LlmProviderOptions['fakeBehavior']>;
  private inner = new DeterministicProvider();

  constructor(o: LlmProviderOptions) {
    this.behavior = o.fakeBehavior ?? 'ok';
  }

  private maybeFail<T>(result: T): Promise<T> {
    switch (this.behavior) {
      case 'ok':
        return Promise.resolve(result);
      case 'empty':
        return Promise.reject(new Error('llm empty output'));
      case 'timeout':
        return new Promise((_, rej) => setTimeout(() => rej(new Error('llm timeout')), 5));
      case 'invalid-json':
        return Promise.resolve('{not valid json' as unknown as T);
      case 'slow':
        return new Promise((resolve) => setTimeout(() => resolve(result), 3_000));
      case 'omit-field':
        // drop a required top-level field of the report shape
        if (Array.isArray(result)) return Promise.resolve(result);
        if (result && typeof result === 'object') {
          const copy = { ...(result as object) } as Record<string, unknown>;
          if ('strategyThesis' in copy) {
            const { strategyThesis: _omit, ...rest } = copy;
            return Promise.resolve(rest as T);
          }
        }
        return Promise.resolve(result);
    }
  }

  async assess(ctx: AssessContext): Promise<AssessAnswerOutput> {
    if (this.behavior === 'omit-field') return this.inner.assess(ctx);
    return this.maybeFail(await this.inner.assess(ctx));
  }

  async reflect(ctx: ReflectContext): Promise<ReflectionOutput> {
    if (this.behavior === 'omit-field') return this.inner.reflect(ctx);
    return this.maybeFail(await this.inner.reflect(ctx));
  }

  async report(ctx: ReportContext): Promise<ReportOutput> {
    if (this.behavior === 'omit-field') {
      const base = await this.inner.report(ctx);
      const { strategyThesis: _omit, ...rest } = base;
      return rest as unknown as ReportOutput;
    }
    return this.maybeFail(await this.inner.report(ctx));
  }
}
