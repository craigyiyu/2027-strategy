/**
 * LLM adapter layer (server-side only, SEC-01).
 * Three kinds of typed generation: assess, reflect, report.
 * Providers: live (OpenAI-compatible DeepSeek), deterministic (no-key
 * synthesizer), fake (CI failure fixtures). Strict schema validation happens
 * in orchestration with at most one repair attempt (REPORT-001).
 */
import type { AssessAnswerOutput, ReflectionOutput, ReportOutput } from '@2027strategy/shared';

export interface AssessContext {
  language: 'en' | 'zh-CN';
  stage: string;
  questionText: string;
  answer: string;
  lens: string;
  industry: string;
  followupCountUsed: number;
  followupsThisStage: number;
  previousExtracted: Array<{ statement: string; type: string }>;
}

export interface ReflectContext {
  language: 'en' | 'zh-CN';
  lens: string;
  answers: Array<{ stageId: string; text: string }>;
  priorExtracted: Array<{ statement: string; type: string; source_stage: string }>;
}

export interface ReportContext {
  language: 'en' | 'zh-CN';
  lens: string;
  roleBand: string;
  industryBand: string;
  organizationAlias: string | null;
  answers: Array<{ stageId: string; text: string }>;
  reflection: ReflectionOutput;
}

export interface GenerationMeta {
  modelId: string;
  promptVersion: string;
  provider: string;
}

export interface LlmProvider {
  meta: GenerationMeta;
  assess(ctx: AssessContext): Promise<AssessAnswerOutput>;
  reflect(ctx: ReflectContext): Promise<ReflectionOutput>;
  report(ctx: ReportContext): Promise<ReportOutput>;
}

export interface LlmProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fastModel?: string;
  strongModel?: string;
  timeoutMs?: number;
  /** max output tokens (reasoning models need headroom for thinking) */
  maxTokens?: number;
  promptVersion: string;
  /** synthetic failure behavior for fake provider */
  fakeBehavior?: 'ok' | 'invalid-json' | 'timeout' | 'empty' | 'omit-field' | 'slow';
}
