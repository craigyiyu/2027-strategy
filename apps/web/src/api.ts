/**
 * Typed API client for the 2027 Strategy server (see packages/server/src/app.ts
 * for the authoritative wire shapes). All fetch-based; tokens come from the
 * URL path, admin token from sessionStorage only.
 */
import type {
  AssessAnswerOutput,
  CoreStageId,
  IndustryBand,
  Language,
  Lens,
  PreviewResponse,
  PrivacyMode,
  ReflectionOutput,
  ReportOutput,
  RoleBand,
  SessionCreateInput,
  SessionStatus,
} from '@2027strategy/shared';

/* ------------------------------------------------------------------ */
/* Response shapes (as actually produced by the server)                */
/* ------------------------------------------------------------------ */

export interface SessionState {
  language: Language;
  lens: Lens;
  roleBand: RoleBand;
  industryBand: IndustryBand;
  privacyMode: PrivacyMode;
  organizationAlias: string | null;
  status: SessionStatus;
  coreStage: number;
  followupCount: number;
  currentStageId: CoreStageId | null;
  reflectionState: 'none' | 'ready' | 'confirmed';
  methodVersion: string;
  promptVersion: string;
  schemaVersion: string;
  expiresAt: string;
  createdAt: string;
  answeredStages: string[];
  reportAvailable: boolean;
}

export interface SessionCreateResponse {
  ok: true;
  token: string;
  reportToken: string;
  status: string;
  coreStage: number;
  currentStage: CoreStageId | null;
  expiresAt: string;
  methodVersion: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface SubmitAnswerResponse {
  ok: true;
  duplicate?: true;
  assessment?: AssessAnswerOutput;
  session: SessionState;
  followupQuestion?: string | null;
  allCoreAnswered?: boolean;
}

export interface ConfirmReflectionResponse {
  ok: true;
  session: SessionState;
}

export interface DeliveryResponse {
  ok: true;
  duplicate?: true;
  emailDelivered?: boolean;
  session: SessionState;
  reportStatus?: string;
}

export interface FeedbackResponse {
  ok: true;
}

export interface ResendResponse {
  ok: true;
  sent: boolean;
}

export interface DeleteResponse {
  ok: true;
  neutral?: boolean;
  receipt?: { id: string; deletedAt?: string };
}

export interface AdminFunnelMetrics {
  landingVisits: number;
  interviewStarts: number;
  stageFunnel: Record<string, number>;
  previewReached: number;
  fullReportGenerated: number;
  emailDeliveryRate: number;
  optInCounts: { newsletter: number; pulse: number; followup: number };
  priorityCategories: Array<{ category: string; count: number; suppressed: boolean }>;
  byLanguage?: Record<string, number>;
  byLens?: Record<string, number>;
}

export interface AdminSessionView {
  id: string;
  language: string;
  lens: string;
  roleBand: string;
  industryBand: string;
  privacyMode: string;
  status: string;
  coreStage: number;
  followupCount: number;
  createdAt: string;
  expiresAt: string;
  reportCount: number;
  consents: Array<{ purpose: string; granted: number }>;
  rawHidden: true;
}

export interface RevealedRawAnswer {
  stageId: string;
  kind: string;
  text: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ApiErrorDetail {
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  status: number;
  code: string;
  detail: ApiErrorDetail;
  constructor(status: number, code: string, message: string, detail: ApiErrorDetail = {}) {
    super(message || `Request failed (${code || status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function isNeutralLinkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/* ------------------------------------------------------------------ */
/* Fetch helper                                                        */
/* ------------------------------------------------------------------ */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function readErrorBody(res: Response): Promise<ApiErrorDetail> {
  try {
    const text = await res.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      retryAfterSeconds:
        typeof parsed.retryAfterSeconds === 'number' ? parsed.retryAfterSeconds : undefined,
    };
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network', 'Network request failed.');
  }
  if (!res.ok) {
    const detail = await readErrorBody(res);
    throw new ApiError(
      res.status,
      detail.code ?? (res.status === 429 ? 'rate_limited' : 'http'),
      detail.message ?? `Request failed with status ${res.status}.`,
      detail,
    );
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

/* ------------------------------------------------------------------ */
/* Storage helpers (tokens are capabilities; sessionStorage only)      */
/* ------------------------------------------------------------------ */

const SESSION_MAP_KEY = '2027:sessionReportMap';
const ADMIN_TOKEN_KEY = '2027:adminToken';

/** Remember the report token that belongs to a session token (same browser tab lifetime). */
export function rememberSessionTokens(sessionToken: string, reportToken: string): void {
  try {
    const raw = window.sessionStorage.getItem(SESSION_MAP_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[sessionToken] = reportToken;
    window.sessionStorage.setItem(SESSION_MAP_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function reportTokenForSession(sessionToken: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_MAP_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[sessionToken] ?? null;
  } catch {
    return null;
  }
}

export function adminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeAdminToken(token: string): void {
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearAdminToken(): void {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `w-${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

export function createSession(input: SessionCreateInput): Promise<SessionCreateResponse> {
  return request<SessionCreateResponse>('/api/session', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function getSession(token: string): Promise<{ ok: true; session: SessionState }> {
  return request(`/api/session/${encodeURIComponent(token)}`);
}

export interface AnswerPayload {
  stageId: string;
  answer: string;
  idempotencyKey: string;
}

export function submitAnswer(
  token: string,
  payload: AnswerPayload,
): Promise<SubmitAnswerResponse> {
  return request(`/api/session/${encodeURIComponent(token)}/answer`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function submitFollowup(
  token: string,
  payload: AnswerPayload,
): Promise<SubmitAnswerResponse> {
  return request(`/api/session/${encodeURIComponent(token)}/followup`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function skipStage(token: string): Promise<{ ok: true; session: SessionState; allCoreAnswered?: boolean }> {
  return request(`/api/session/${encodeURIComponent(token)}/skip`, { method: 'POST' });
}

export function editAnswer(
  token: string,
  responseId: string,
  answer: string,
): Promise<{ ok: true; session: SessionState; invalidated?: boolean }> {
  return request(`/api/session/${encodeURIComponent(token)}/answer/${encodeURIComponent(responseId)}/edit`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ answer }),
  });
}

/* ------------------------------------------------------------------ */
/* Reflection, preview, delivery                                       */
/* ------------------------------------------------------------------ */

export function generateReflection(
  token: string,
): Promise<{ ok: true; reflection: ReflectionOutput }> {
  return request(`/api/session/${encodeURIComponent(token)}/reflection`, { method: 'POST' });
}

export function confirmReflection(
  token: string,
  payload: { corrections: string; confirmation: 'confirm'; idempotencyKey: string },
): Promise<ConfirmReflectionResponse> {
  return request(`/api/session/${encodeURIComponent(token)}/reflection/confirm`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function getPreview(
  token: string,
): Promise<{ ok: true; preview: PreviewResponse }> {
  return request(`/api/session/${encodeURIComponent(token)}/preview`);
}

export interface DeliveryPayload {
  email: string;
  firstName?: string;
  consents: {
    reportDelivery: boolean;
    newsletter: boolean;
    pulse: boolean;
    followup: boolean;
  };
  reportToken?: string;
  idempotencyKey: string;
}

export function submitDelivery(
  token: string,
  payload: DeliveryPayload,
): Promise<DeliveryResponse> {
  return request(`/api/session/${encodeURIComponent(token)}/delivery`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export function getReport(token: string): Promise<{ ok: true; report: ReportOutput }> {
  return request(`/api/report/${encodeURIComponent(token)}`);
}

export interface FeedbackPayload {
  rating: number;
  mostHelpfulQuestion?: string;
  leastHelpfulQuestion?: string;
  comments?: string;
  followupRequested: boolean;
}

export function submitFeedback(token: string, payload: FeedbackPayload): Promise<FeedbackResponse> {
  return request(`/api/report/${encodeURIComponent(token)}/feedback`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function resendReport(token: string): Promise<ResendResponse> {
  return request(`/api/report/${encodeURIComponent(token)}/resend`, { method: 'POST' });
}

/* ------------------------------------------------------------------ */
/* Deletion                                                            */
/* ------------------------------------------------------------------ */

export function requestDelete(token: string): Promise<DeleteResponse> {
  return request('/api/privacy/delete', {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'x-deletion-token': token },
    body: JSON.stringify({ confirmation: 'delete' }),
  });
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

function adminHeaders(): HeadersInit {
  const token = adminToken();
  return {
    ...JSON_HEADERS,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function adminMetrics(): Promise<{ ok: true; metrics: AdminFunnelMetrics }> {
  return request('/api/admin/metrics', { headers: adminHeaders() });
}

export function adminSessions(): Promise<{ ok: true; sessions: AdminSessionView[] }> {
  return request('/api/admin/sessions', { headers: adminHeaders() });
}

export function adminSession(id: string): Promise<{ ok: true; session: AdminSessionView }> {
  return request(`/api/admin/sessions/${encodeURIComponent(id)}`, { headers: adminHeaders() });
}

export function adminReveal(
  id: string,
  reason: string,
): Promise<{ ok: true; raw: RevealedRawAnswer[] }> {
  return request(`/api/admin/sessions/${encodeURIComponent(id)}/reveal`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ reason }),
  });
}

export function adminAudit(): Promise<{ ok: true; audit: Array<Record<string, unknown>> }> {
  return request('/api/admin/audit', { headers: adminHeaders() });
}

export async function adminContactsExport(): Promise<{ filename: string; blob: Blob }> {
  const token = adminToken();
  const res = await fetch('/api/admin/contacts/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const detail = await readErrorBody(res);
    throw new ApiError(res.status, detail.code ?? 'http', detail.message ?? 'Export failed.', detail);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? '2027-strategy-consented-contacts.csv';
  return { filename, blob: await res.blob() };
}
