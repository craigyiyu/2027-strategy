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

/**
 * MiniMax M2.x (and some reasoning models) wrap chain-of-thought in
 * <think>…</think> inside `message.content`. Strip that (and stray markdown
 * fences) and extract the JSON object before parsing.
 */
export function extractJsonPayload(raw: string): string {
  let out = raw ?? '';
  out = out.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const first = out.indexOf('{');
  const last = out.lastIndexOf('}');
  if (first !== -1 && last > first) out = out.slice(first, last + 1);
  return out.trim();
}

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
    maxTokens: number;
  };

  private supportsJsonMode: boolean;

  constructor(o: LlmProviderOptions) {
    if (!o.apiKey) throw new Error('LiveProvider requires an API key');
    this.opts = {
      apiKey: o.apiKey,
      baseUrl: o.baseUrl ?? 'https://api.deepseek.com',
      timeoutMs: o.timeoutMs ?? 60000,
      fastModel: o.fastModel ?? 'deepseek-chat',
      strongModel: o.strongModel ?? 'deepseek-chat',
      promptVersion: o.promptVersion,
      maxTokens: o.maxTokens ?? 8000,
    };
    this.supportsJsonMode = true;
    this.meta = { modelId: this.opts.fastModel, promptVersion: this.opts.promptVersion, provider: 'live' };
  }

  private async chat(model: string, system: string, user: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const started = Date.now();
    const payload: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.0, // deterministic for assess/report stability
      max_tokens: this.opts.maxTokens,
    };
    if (!this.supportsJsonMode) {
      // some providers/models reject response_format (400) — remember and skip it
    } else {
      payload.response_format = { type: 'json_object' };
    }
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    let latency = Date.now() - started;
    let bodyText = '';
    if (!res.ok) {
      bodyText = await res.text().catch(() => '');
      // graceful degradation: retry once without response_format
      if (res.status === 400 && /response_format/i.test(bodyText) && this.supportsJsonMode) {
        logger.warn('llm', 'provider rejected response_format; retrying without it', { model });
        this.supportsJsonMode = false;
        delete payload.response_format;
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        latency = Date.now() - started;
        if (!res.ok) bodyText = await res.text().catch(() => '');
      }
      if (!res.ok) {
        logger.error('llm', `provider http ${res.status}`, { latencyMs: latency, status: res.status });
        throw new Error(`llm provider error ${res.status}: ${bodyText.slice(0, 200)}`);
      }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    logger.info('llm', 'provider ok', { latencyMs: latency, model });
    if (!content || !content.trim()) throw new Error('llm empty output');
    return content;
  }

  private async parse<T>(
    schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: unknown } },
    raw: string,
    model: string,
    system: string,
    user: string,
    allowRepair = true,
    normalize?: (v: unknown) => unknown,
  ): Promise<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonPayload(raw));
    } catch {
      throw new Error('llm invalid json');
    }
    const attempt = (v: unknown) => schema.safeParse(normalize ? normalize(v) : v);
    let r = attempt(parsed);
    if (!r.success && allowRepair) {
      // one schema-repair attempt (REPORT-001): re-send with the failure details
      const issues = JSON.stringify(
        (r.error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.slice(0, 8) ?? [],
      );
      const repairedRaw = await this.chat(model, system, `${user}\n\nYour previous output failed validation. Fix ONLY these issues and return the complete corrected JSON (same schema).\nIssues: ${issues}`);
      try {
        parsed = JSON.parse(extractJsonPayload(repairedRaw));
      } catch {
        throw new Error('llm invalid json after repair');
      }
      r = attempt(parsed);
      if (!r.success) throw new Error('llm schema mismatch after repair: ' + issuePaths(r.error));
      return r.data as T;
    }
    if (!r.success) throw new Error('llm schema mismatch: ' + issuePaths(r.error));
    return r.data as T;
  }

  async assess(ctx: AssessContext): Promise<AssessAnswerOutput> {
    const { system, user } = buildAssessPrompt(ctx);
    const raw = await this.chat(this.opts.fastModel, system, user);
    return this.parse(assessAnswerOutput, raw, this.opts.fastModel, system, user, true, normalizeAssess);
  }

  async reflect(ctx: ReflectContext): Promise<ReflectionOutput> {
    const { system, user } = buildReflectPrompt(ctx);
    const raw = await this.chat(this.opts.strongModel, system, user);
    return this.parse(reflectionOutput, raw, this.opts.strongModel, system, user, true, normalizeReflection);
  }

  /** parse with an optional deterministic shape-normalizer applied before validation. */
  private async parseWithNormalizer<T>(
    schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: unknown } },
    raw: string,
    model: string,
    system: string,
    user: string,
    normalize: (v: unknown) => unknown,
  ): Promise<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonPayload(raw));
    } catch {
      throw new Error('llm invalid json');
    }
    let r = schema.safeParse(normalize(parsed));
    if (!r.success) {
      const issues = JSON.stringify(
        (r.error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.slice(0, 8) ?? [],
      );
      const repairedRaw = await this.chat(model, system, `${user}\n\nFix ONLY these issues and return the complete corrected JSON (same schema).\nIssues: ${issues}`);
      try {
        parsed = JSON.parse(extractJsonPayload(repairedRaw));
      } catch {
        throw new Error('llm invalid json after repair');
      }
      r = schema.safeParse(normalize(parsed));
      if (!r.success) throw new Error('llm schema mismatch after repair');
      return r.data as T;
    }
    return r.data as T;
  }

  async report(ctx: ReportContext): Promise<ReportOutput> {
    const { system, user } = buildReportPrompt(ctx);
    const raw = await this.chat(this.opts.strongModel, system, user);
    return this.parse(reportOutput, raw, this.opts.strongModel, system, user, true, normalizeReport);
  }
}


/**
 * Deterministic shape normalizer: the live model sometimes returns a string
 * where the contract requires an array of strings (or object arrays). Coerce
 * those before strict validation — never changes semantics.
 */
function issuePaths(error: unknown): string {
  try {
    const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues ?? [];
    return issues.slice(0, 6).map((i) => i.path.join('.')).join('|');
  } catch {
    return 'unknown';
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return v.trim() ? [v] : [];
  return [];
}
function asDiagnosisArray(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.map((d) => {
    if (typeof d === 'string') return { diagnosis: d, support: [], counter_evidence: [] };
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      return {
        diagnosis: typeof o.diagnosis === 'string' ? o.diagnosis : '',
        support: asStringArray(o.support),
        counter_evidence: asStringArray(o.counter_evidence),
      };
    }
    return null;
  }).filter((x): x is { diagnosis: string; support: string[]; counter_evidence: string[] } => !!x && x.diagnosis !== '');
}
export function normalizeReflection(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.decision !== 'string') o.decision = String(o.decision ?? '');
  o.facts = asStringArray(o.facts);
  o.assumptions = asStringArray(o.assumptions);
  o.conflicts = asStringArray(o.conflicts);
  o.missing_evidence = asStringArray(o.missing_evidence);
  if (typeof o.proposed_crux !== 'string') o.proposed_crux = String(o.proposed_crux ?? '');
  if (o.candidate_diagnoses !== undefined) o.candidate_diagnoses = asDiagnosisArray(o.candidate_diagnoses);
  return o;
}

/** Normalize assess output drift from the live model before strict validation. */
export function normalizeAssess(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.acknowledgment !== 'string') o.acknowledgment = 'Noted.';
  if (typeof o.answer_quality !== 'string') o.answer_quality = 'sufficient';
  if (typeof o.needs_followup !== 'boolean') o.needs_followup = false;
  if (o.needs_followup === false) o.followup_question = null;
  if (Array.isArray(o.extracted_items)) {
    o.extracted_items = (o.extracted_items as unknown[]).map((it) => {
      if (!it || typeof it !== 'object') return null;
      const x = it as Record<string, unknown>;
      const statement = typeof x.statement === 'string' ? x.statement : typeof x.content === 'string' ? x.content : '';
      const type = typeof x.type === 'string' && ['user_fact','user_assumption','user_preference','constraint','unknown'].includes(x.type) ? x.type : 'unknown';
      const source_stage = typeof x.source_stage === 'string' ? x.source_stage : (typeof x.stage === 'string' ? x.stage : 'Q?');
      const needs_validation = x.needs_validation === true;
      return { statement, type, source_stage, needs_validation };
    }).filter((x): x is { statement: string; type: string; source_stage: string; needs_validation: boolean } => !!x && x.statement !== '');
  } else {
    o.extracted_items = [];
  }
  if (!Array.isArray(o.sensitivity_flags)) o.sensitivity_flags = ['none'];
  return o;
}

/* ---------- report normalizer ---------- */

const VALID_LABELS = new Set(['user_fact','user_assumption','ai_inference','needs_validation','human_decision']);

/** Recover a provenance label appended as a suffix like “ (user_fact)”. */
function splitTrailingLabel(text: string): { text: string; label: string | null } {
  const m = /\s*\((user_fact|user_assumption|ai_inference|needs_validation|human_decision)\)\s*$/i.exec(text);
  if (m) return { text: text.slice(0, m.index).trim(), label: (m[1] ?? '').toLowerCase() };
  return { text, label: null };
}

/** Coerce one provenance statement from whatever the model returned. */
function asStatement(v: unknown): { text: string; label: string; sourceStage: string | null; sourceResponseId: string | null; note: string | null } | null {
  if (typeof v === 'string') {
    const { text, label } = splitTrailingLabel(v.trim());
    if (!text) return null;
    return { text, label: label ?? 'ai_inference', sourceStage: null, sourceResponseId: null, note: null };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    let text = typeof o.text === 'string' ? o.text : typeof o.statement === 'string' ? o.statement : typeof o.content === 'string' ? o.content : '';
    const rawLabel = typeof o.label === 'string' ? o.label : typeof o.type === 'string' ? o.type : 'ai_inference';
    const src = typeof o.sourceStage === 'string' ? o.sourceStage : typeof o.source_stage === 'string' ? o.source_stage : null;
    const fromText = splitTrailingLabel(text);
    text = fromText.text || text;
    const label = (fromText.label ?? rawLabel ?? 'ai_inference') as string;
    const valid = VALID_LABELS.has(label) ? label : 'ai_inference';
    const note = typeof o.note === 'string' ? o.note : null;
    if (!text.trim()) return null;
    return { text: text.trim(), label: valid, sourceStage: src, sourceResponseId: src, note: note ?? (valid === 'ai_inference' ? 'AI inference — needs validation' : null) };
  }
  return null;
}
function asStatements(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.map(asStatement).filter((x): x is NonNullable<typeof x> => !!x) as unknown as Array<Record<string, unknown>>;
}
function asStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' && v.trim() ? [v] : [];
}

export function normalizeReport(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.strategyThesis !== 'string') o.strategyThesis = String(o.strategyThesis ?? '');
  if (typeof o.language !== 'string') o.language = 'en';

  // --- statements (provenance objects) ---
  const db = obj(o.decisionBrief);
  for (const k of ['decision', 'winningAspiration', 'whereToPlay', 'howToWin', 'confirmedDiagnosis', 'cruxStatement']) {
    if (k in db) db[k] = stmtOf(db[k]);
  }
  for (const k of ['scope', 'hardConstraints', 'requiredCapabilities', 'managementSystems']) {
    if (k in db) db[k] = asStatements(db[k]);
  }
  o.decisionBrief = db;

  if ('evidenceBase' in o) o.evidenceBase = asStatements(o.evidenceBase);
  if ('stopDefer' in o) o.stopDefer = asStatements(o.stopDefer);

  const cd = obj(o.challengeDiagnosis);
  if ('symptoms' in cd) cd.symptoms = asStatements(cd.symptoms);
  if ('confirmedDiagnosis' in cd) cd.confirmedDiagnosis = stmtOf(cd.confirmedDiagnosis);
  if (Array.isArray(cd.candidateDiagnoses)) cd.candidateDiagnoses = cd.candidateDiagnoses.map(diagOf).filter(Boolean);
  o.challengeDiagnosis = cd;

  // --- reverse economics ---
  const re = obj(o.reverseEconomics);
  re.mustBeTrueForValue = asStrArray(re.mustBeTrueForValue);
  re.mustBeTrueForCost = asStrArray(re.mustBeTrueForCost);
  if ('statements' in re) re.statements = asStatements(re.statements);
  o.reverseEconomics = re;

  const cx = obj(o.crux);
  if ('cruxStatement' in cx) cx.cruxStatement = stmtOf(cx.cruxStatement);
  if ('whyNow' in cx) cx.whyNow = asStatements(cx.whyNow);
  cx.alternativesConsidered = asStrArray(cx.alternativesConsidered); // always coerce to string[]
  o.crux = cx;

  // --- alternatives ---
  if (Array.isArray(o.strategicAlternatives)) {
    o.strategicAlternatives = o.strategicAlternatives.map((a) => {
      const x = obj(a);
      const pick = (k: string, def = '') => typeof x[k] === 'string' ? x[k] : def;
      const t0 = x.tradeoffs !== undefined ? asStatements(x.tradeoffs) : [];
      return {
        name: pick('name', 'Alternative'),
        guidingPolicy: pick('guidingPolicy', pick('policy', 'Needs validation.')),
        whereToPlay: pick('whereToPlay', 'Needs validation.'),
        howToWin: pick('howToWin', 'Needs validation.'),
        tradeoffs: t0,
      };
    });
  }

  // --- choice contract ---
  const cc = obj(o.choiceContract);
  for (const k of ['winningAspiration', 'whereToPlay', 'howToWin']) if (k in cc) cc[k] = stmtOf(cc[k]);
  if ('requiredCapabilities' in cc) cc.requiredCapabilities = asStatements(cc.requiredCapabilities);
  if ('managementSystems' in cc) cc.managementSystems = asStatements(cc.managementSystems);
  o.choiceContract = cc;

  // --- assumption register ---
  if (Array.isArray(o.assumptionRegister)) {
    o.assumptionRegister = o.assumptionRegister.map((a) => {
      const x = obj(a);
      const text = typeof x.assumption === 'string' ? x.assumption : x.text;
      const label = typeof x.label === 'string' && VALID_LABELS.has(x.label) ? x.label : 'ai_inference';
      return {
        assumption: String(text ?? 'Needs validation.'),
        label,
        sourceResponseId: typeof x.sourceResponseId === 'string' ? x.sourceResponseId : null,
        sourceStage: typeof x.sourceStage === 'string' ? x.sourceStage : null,
        importance: ['critical', 'important', 'secondary'].includes(String(x.importance)) ? x.importance : 'important',
        evidenceState: ['supported', 'plausible', 'unvalidated', 'contested'].includes(String(x.evidenceState)) ? x.evidenceState : 'unvalidated',
      };
    });
  }

  // --- gates / actions / measures / risks ---
  if (Array.isArray(o.evidenceGates)) {
    o.evidenceGates = o.evidenceGates.map((g) => {
      const x = obj(g);
      const pickS = (k: string, def = '') => typeof x[k] === 'string' ? x[k] : (typeof x[k] === 'object' ? stmtOf(x[k])?.text ?? def : def);
      return {
        owner: pickS('owner', 'Named owner required.'),
        test: pickS('test', pickS('action', 'Needs validation.')),
        threshold: pickS('threshold', 'Needs validation.'),
        reviewDate: pickS('reviewDate', pickS('date', 'TBD')),
        decisionRule: ['continue','adjust','pause','exit'].includes(String(x.decisionRule)) ? x.decisionRule : 'adjust',
        measure: pickS('measure', 'Needs validation.'),
      };
    });
  }
  if (Array.isArray(o.actionPortfolio)) {
    o.actionPortfolio = o.actionPortfolio.map((a) => {
      const x = obj(a);
      const pickS = (k: string, def = '') => typeof x[k] === 'string' ? x[k] : (x.text ? String(x.text) : def);
      return {
        action: pickS('action', 'Needs validation.'),
        owner: pickS('owner', 'Named owner required.'),
        milestone: pickS('milestone', 'First 90-day milestone.'),
        supportsPriority: pickS('supportsPriority', 'Priority 1'),
      };
    });
  }
  if (Array.isArray(o.executionMeasures)) {
    o.executionMeasures = o.executionMeasures.map((m) => {
      const x = obj(m);
      return {
        measure: typeof x.measure === 'string' ? x.measure : String(x.text ?? 'Needs validation.'),
        kind: ['outcome','driver','early_warning'].includes(String(x.kind)) ? x.kind : 'outcome',
        dataSource: typeof x.dataSource === 'string' ? x.dataSource : 'Needs validation.',
        owner: typeof x.owner === 'string' ? x.owner : 'Named owner required.',
        cadence: typeof x.cadence === 'string' ? x.cadence : 'Monthly review.',
      };
    });
  }
  if (Array.isArray(o.riskReviews)) {
    o.riskReviews = o.riskReviews.map((r) => {
      const x = obj(r);
      const risk = typeof x.risk === 'string' ? x.risk : String(x.text ?? 'Needs validation.');
      const areas = ['privacy','security','regulatory','capital','reputation','operations','financial'];
      return {
        risk,
        area: areas.includes(String(x.area)) ? x.area : 'regulatory',
        requiresHumanApproval: x.requiresHumanApproval === false ? false : true,
        reviewOwner: typeof x.reviewOwner === 'string' ? x.reviewOwner : 'Named human owner required.',
        label: typeof x.label === 'string' && VALID_LABELS.has(x.label) ? x.label : 'ai_inference',
        sourceResponseId: typeof x.sourceResponseId === 'string' ? x.sourceResponseId : null,
        sourceStage: typeof x.sourceStage === 'string' ? x.sourceStage : null,
      };
    });
  }

  // --- decision record ---
  const dr = obj(o.decisionRecord);
  if ('confirmedDecision' in dr) dr.confirmedDecision = stmtOf(dr.confirmedDecision);
  for (const k of ['pendingOwnerDecisions', 'revisitTriggers', 'approvedBy']) {
    dr[k] = asStrArray(dr[k]); // always coerce: strings stay, objects dropped
  }
  if (typeof dr.reviewCadence !== 'string') dr.reviewCadence = 'Monthly during the first quarter.';
  o.decisionRecord = dr;

  // --- readiness snapshot ---
  if (!Array.isArray(o.readinessSnapshot)) {
    const dims = ['diagnosis_clarity','choice_clarity','evidence_readiness','execution_ownership','risk_governance'];
    o.readinessSnapshot = dims.map((d) => ({ dimension: d, level: 'amber', explanation: 'Needs validation.' }));
  } else {
    const DIM_MAP: Record<string, string> = {
      diagnosis_clarity: 'diagnosis_clarity', diagnosisclarity: 'diagnosis_clarity', 'Diagnosis clarity': 'diagnosis_clarity',
      choice_clarity: 'choice_clarity', choiceclarity: 'choice_clarity', 'Choice clarity': 'choice_clarity',
      evidence_readiness: 'evidence_readiness', evidencerreadiness: 'evidence_readiness', 'Evidence readiness': 'evidence_readiness',
      execution_ownership: 'execution_ownership', executionownership: 'execution_ownership', 'Execution ownership': 'execution_ownership',
      risk_governance: 'risk_governance', riskgovernance: 'risk_governance', 'Risk governance': 'risk_governance',
    };
    const DIMS = ['diagnosis_clarity', 'choice_clarity', 'evidence_readiness', 'execution_ownership', 'risk_governance'];
    const snap = o.readinessSnapshot.slice(0, 6).map((s) => {
      const x = obj(s);
      const rawDim = String(x.dimension ?? x.name ?? '').toLowerCase().replace(/[^a-z]/g, '');
      return {
        dimension: DIM_MAP[rawDim] ?? DIM_MAP[String(x.dimension ?? '')] ?? null,
        level: ['green','amber','red'].includes(String(x.level)) ? x.level : (['green','amber','red'].includes(String(x.status)) ? x.status : 'amber'),
        explanation: typeof x.explanation === 'string' ? x.explanation : (typeof x.reason === 'string' ? x.reason : 'Needs validation.'),
      };
    }).filter((s) => s.dimension !== null);
    const seen = new Set<string>();
    const finalSnap: Array<Record<string, unknown>> = [];
    for (const d of DIMS) {
      const found = snap.find((s) => s.dimension === d);
      finalSnap.push(found ?? { dimension: d, level: 'amber', explanation: 'Needs validation.' });
    }
    o.readinessSnapshot = finalSnap;
  }
  if (!Array.isArray(o.limitations)) o.limitations = asStrArray(o.limitations).length ? o.limitations : ['Generated by AI; validate before execution.'];
  return o;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? { ...(v as Record<string, unknown>) } : {};
}

/** Coerce any value into a provenance statement. */
function stmtOf(v: unknown): { text: string; label: string; sourceResponseId: string | null; sourceStage: string | null; note: string | null } {
  const s = asStatement(v);
  if (s) return s;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const text = [o.text, o.statement, o.content, o.decision, o.summary, o.diagnosis]
      .map((x) => (typeof x === 'string' ? x : '')).find(Boolean) ?? '';
    const label = typeof o.label === 'string' && VALID_LABELS.has(o.label) ? o.label : 'ai_inference';
    return { text: text.trim() || 'Needs validation.', label, sourceResponseId: null, sourceStage: null, note: label === 'ai_inference' ? 'AI inference — needs validation' : null };
  }
  return { text: 'Needs validation.', label: 'ai_inference', sourceResponseId: null, sourceStage: null, note: 'AI inference — needs validation' };
}

function diagOf(v: unknown): { diagnosis: string; support: string[]; counter_evidence: string[] } | null {
  if (typeof v === 'string') return { diagnosis: v, support: [], counter_evidence: [] };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const diagnosis = [o.diagnosis, o.text].map((x) => (typeof x === 'string' ? x : '')).find(Boolean) ?? '';
    return { diagnosis: diagnosis || 'Needs validation.', support: asStrArray(o.support), counter_evidence: asStrArray(o.counter_evidence) };
  }
  return null;
}
