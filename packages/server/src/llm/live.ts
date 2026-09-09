/**
 * Live OpenAI-compatible provider (DeepSeek by default). Strict JSON prompts +
 * response_format json_object; final validation is server-side via zod in
 * orchestration. Never streams raw model content to the client.
 */
import type { AssessAnswerOutput, ReflectionOutput, ReportOutput } from '@2027strategy/shared';
import {
  assessAnswerOutput,
  reflectionOutput,
  reportOutput,
} from '@2027strategy/shared';
import { logger } from '../logger';
import type { AssessContext, LlmProviderOptions, ReflectContext, ReportContext } from './types';
import { buildAssessPrompt, buildReflectPrompt, buildReportPrompt } from './prompts';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class LiveProvider {
  readonly meta: { modelId: string; promptVersion: string; provider: 'live' };
  private opts: Required<Pick<LlmProviderOptions, 'apiKey' | 'baseUrl' | 'timeoutMs'>> & {
    fastModel: string;
    strongModel: string;
    promptVersion: string;
  };

  constructor(o: LlmProviderOptions) {
    if (!o.apiKey) throw new Error('LiveProvider requires an API key');
    this.opts = {
      apiKey: o.apiKey,
      baseUrl: o.baseUrl ?? 'https://api.deepseek.com',
      timeoutMs: o.timeoutMs ?? 60000,
      fastModel: o.fastModel ?? 'deepseek-chat',
      strongModel: o.strongModel ?? 'deepseek-chat',
      promptVersion: o.promptVersion,
    };
    this.meta = { modelId: this.opts.fastModel, promptVersion: this.opts.promptVersion, provider: 'live' };
  }

  private async chat(model: string, system: string, user: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    const latency = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('llm', `provider http ${res.status}`, { latencyMs: latency, status: res.status });
      throw new Error(`llm provider error ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    logger.info('llm', 'provider ok', { latencyMs: latency, model });
    if (!content || !content.trim()) throw new Error('llm empty output');
    return content;
  }

  private async parse<T>(schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: unknown } }, raw: string, model: string, system: string, user: string, allowRepair = true): Promise<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('llm invalid json');
    }
    let r = schema.safeParse(parsed);
    if (!r.success && allowRepair) {
      // one schema-repair attempt (REPORT-001): re-send with the failure details
      const issues = JSON.stringify(
        (r.error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.slice(0, 8) ?? [],
      );
      const repairedRaw = await this.chat(model, system, `${user}\n\nYour previous output failed validation. Fix ONLY these issues and return the complete corrected JSON (same schema).\nIssues: ${issues}`);
      try {
        parsed = JSON.parse(repairedRaw);
      } catch {
        throw new Error('llm invalid json after repair');
      }
      r = schema.safeParse(parsed);
      if (!r.success) throw new Error('llm schema mismatch after repair');
      return r.data as T;
    }
    if (!r.success) throw new Error('llm schema mismatch');
    return r.data as T;
  }

  async assess(ctx: AssessContext): Promise<AssessAnswerOutput> {
    const { system, user } = buildAssessPrompt(ctx);
    const raw = await this.chat(this.opts.fastModel, system, user);
    return this.parse(assessAnswerOutput, raw, this.opts.fastModel, system, user);
  }

  async reflect(ctx: ReflectContext): Promise<ReflectionOutput> {
    const { system, user } = buildReflectPrompt(ctx);
    const raw = await this.chat(this.opts.strongModel, system, user);
    return this.parse(reflectionOutput, raw, this.opts.strongModel, system, user);
  }

  async report(ctx: ReportContext): Promise<ReportOutput> {
    const { system, user } = buildReportPrompt(ctx);
    const raw = await this.chat(this.opts.strongModel, system, user);
    return this.parse(reportOutput, raw, this.opts.strongModel, system, user);
  }
}
