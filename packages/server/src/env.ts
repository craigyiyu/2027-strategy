/** Typed environment configuration — all secrets server-side only. */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3317),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:3317'),
  APP_SECRET: z.string().min(24).default('dev-only-secret-not-for-production-000'),
  ENCRYPTION_KEY: z.string().default(''),
  ADMIN_TOKEN: z.string().default(''),

  LLM_MODE: z.enum(['live', 'fake', 'deterministic']).default('deterministic'),
  // LLM_API_KEY is the generic key; DEEPSEEK_API_KEY kept for backward compat
  LLM_API_KEY: z.string().optional().default(''),
  DEEPSEEK_API_KEY: z.string().optional().default(''),
  MINIMAX_API_KEY: z.string().optional().default(''),
  LLM_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  LLM_FAST_MODEL: z.string().default('deepseek-chat'),
  LLM_STRONG_MODEL: z.string().default('deepseek-chat'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  LLM_MAX_TOKENS: z.coerce.number().int().min(256).default(8000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false'),

  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('2027 Strategy <no-reply@localhost>'),
  BOOKING_URL: z.string().optional().default(''),

  RETENTION_PRIVATE_HOURS: z.coerce.number().int().min(1).default(24),
  RETENTION_SAVED_DAYS: z.coerce.number().int().min(1).default(90),
  RETENTION_REPORT_MONTHS: z.coerce.number().int().min(1).default(12),
  RETENTION_EMAIL_LOG_DAYS: z.coerce.number().int().min(1).default(90),

  RATE_SESSION_PER_HOUR: z.coerce.number().int().min(1).default(20),
  RATE_AI_PER_HOUR: z.coerce.number().int().min(1).default(60),
  RATE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(1).default(600),
  RATE_FEEDBACK_PER_HOUR: z.coerce.number().int().min(1).default(10),

  PULSE_MIN_CELL: z.coerce.number().int().min(1).default(20),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(overrides: Partial<Record<string, string>> = {}): AppEnv {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) merged[k] = v;
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) merged[k] = v;
  }
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
