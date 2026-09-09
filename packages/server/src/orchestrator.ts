/**
 * Session orchestration — server-owned business logic. The model never
 * controls transitions; these functions enforce the state machine,
 * follow-up budget, sensitivity gate and provenance persistence.
 */
import type {
  AssessAnswerOutput,
  CoreStageId,
  Language,
  PreviewResponse,
  ReflectionOutput,
  ReportOutput,
} from '@2027strategy/shared';
import {
  CORE_STAGES,
  STAGE_CONTENT,
  reportOutput as reportOutputSchema,
  scanSensitive,
} from '@2027strategy/shared';
import type { Repo, SessionRow } from './repo';
import * as sm from './stateMachine';
import type { LlmProvider } from './llm';
import { logger } from './logger';

export class DomainError extends Error {
  constructor(
    public code:
      | 'not_found'
      | 'expired'
      | 'wrong_state'
      | 'sensitive_blocked'
      | 'insufficient_input'
      | 'limit_exceeded'
      | 'invalid_stage',
    message: string,
  ) {
    super(message);
  }
}

export interface AnswerOutcome {
  assessment: AssessAnswerOutput;
  /** null when all 8 core stages complete (reflection ready) */
  nextCoreStage: CoreStageId | null;
  status: string;
  followupQuestion: string | null;
  followupCount: number;
  allCoreAnswered: boolean;
  responseId: string;
}

export class Orchestrator {
  constructor(
    private repo: Repo,
    private llm: LlmProvider,
  ) {}

  /* ---------------- context derivation ---------------- */

  private activeResponses(session: SessionRow) {
    return this.repo.activeResponsesForSession(session.id);
  }

  private followupUsedForStage(session: SessionRow): boolean {
    const stage = this.currentCoreStageId(session);
    if (!stage) return false;
    return this.activeResponses(session).some(
      (r) => r.kind === 'followup' && r.stage_id === `FU-${stage}`,
    );
  }

  currentCoreStageId(session: SessionRow): CoreStageId | null {
    if (session.status === 'reflection_ready' || session.status === 'deleted') return null;
    if (session.core_stage >= sm.MAX_CORE) return null;
    const stage = CORE_STAGES[session.core_stage];
    return (stage as CoreStageId | undefined) ?? null;
  }

  private toContext(session: SessionRow): sm.InterviewContext {
    const rows = this.activeResponses(session);
    const substantive = rows.filter(
      (r) => r.kind === 'core' && r.quality_label && r.quality_label !== 'vague',
    ).length;
    const stage = this.currentCoreStageId(session);
    const presented: CoreStageId = stage ?? sm.FIRST_STAGE;
    return sm.newContextFromSession({
      coreStage: session.core_stage,
      followupCount: session.followup_count,
      currentStageId: presented,
      followupUsedForStage: this.followupUsedForStage(session),
      substantiveCoreCount: substantive,
      reflectionState: session.reflection_state,
      hasActiveReport: !!this.repo.getActiveReport(session.id),
    });
  }

  private lang(session: SessionRow): Language {
    return session.language as Language;
  }

  /** Server-side authoritative sensitivity scan (FR-011). */
  scanAnswer(answer: string) {
    return scanSensitive(answer);
  }

  private writeActive(session: SessionRow, outcome: sm.SubmitOutcome) {
    if (outcome.type === 'followup') {
      this.repo.updateSession(session.id, {
        followup_count: outcome.context.followupCount,
        core_stage: outcome.context.coreStage,
        status: 'in_progress',
      });
      return;
    }
    const done = outcome.context.coreStage >= sm.MAX_CORE;
    this.repo.updateSession(session.id, {
      core_stage: outcome.context.coreStage,
      followup_count: outcome.context.followupCount,
      status: done ? 'reflection_ready' : 'in_progress',
      reflection_state: done ? 'ready' : session.reflection_state,
    });
  }

  /* ---------------- core answers ---------------- */

  async submitCoreAnswer(
    session: SessionRow,
    stageId: CoreStageId,
    answer: string,
  ): Promise<AnswerOutcome> {
    if (session.status !== 'created' && session.status !== 'in_progress') {
      throw new DomainError('wrong_state', `Cannot answer in state ${session.status}`);
    }
    const presented = this.currentCoreStageId(session);
    if (presented !== stageId) {
      throw new DomainError('invalid_stage', `Current stage is ${presented}, not ${stageId}`);
    }
    const guard = this.scanAnswer(answer);
    if (guard.state === 'blocked') {
      this.repo.updateSession(session.id, { status: 'sensitive_input_blocked' });
      throw new DomainError('sensitive_blocked', 'High-severity sensitive content detected; submission blocked.');
    }
    const ctx = this.toContext(session);

    // persist user wording BEFORE AI — never lose an acknowledged save
    const response = this.repo.upsertResponse({
      sessionId: session.id,
      stageId,
      kind: 'core',
      answer,
      extractedJson: [],
      sensitivityState: guard.state,
      qualityLabel: sm.qualityOfAnswer(answer, stageId),
    });

    let assessment: AssessAnswerOutput;
    try {
      assessment = await this.llm.assess({
        language: this.lang(session),
        stage: stageId,
        questionText: STAGE_CONTENT[stageId].question[this.lang(session)],
        answer,
        lens: session.lens,
        industry: session.industry_band,
        followupCountUsed: session.followup_count,
        followupsThisStage: ctx.followupsThisStage,
        previousExtracted: [],
      });
    } catch (err) {
      // answer preserved; state unchanged; caller may retry (FR-032)
      logger.warn('orchestration', 'assess failed, answer preserved', { session: session.id, stage: stageId });
      throw err;
    }
    // model-recommended credential flag → treat as blocked regardless
    if ((assessment.sensitivity_flags ?? []).includes('credential')) {
      this.repo.updateSession(session.id, { status: 'sensitive_input_blocked' });
      throw new DomainError('sensitive_blocked', 'Credential-like content detected.');
    }
    // store provenance on the same response row
    this.repo.updateResponseExtraction(response.id, assessment.extracted_items, assessment.answer_quality);

    const outcome = sm.decideAfterCoreAnswer(ctx, assessment.needs_followup, assessment.followup_question);
    this.writeActive(session, outcome);
    const fresh = this.repo.getSessionById(session.id)!;
    const done = fresh.core_stage >= sm.MAX_CORE;
    return {
      assessment,
      nextCoreStage: done ? null : this.currentCoreStageId(fresh),
      status: fresh.status,
      followupQuestion: outcome.type === 'followup' ? outcome.followupQuestion : null,
      followupCount: fresh.followup_count,
      allCoreAnswered: done,
      responseId: response.id,
    };
  }

  async submitFollowupAnswer(session: SessionRow, answer: string): Promise<AnswerOutcome> {
    if (session.status !== 'in_progress') {
      throw new DomainError('wrong_state', `Cannot answer follow-up in state ${session.status}`);
    }
    const stage = this.currentCoreStageId(session);
    if (!stage) throw new DomainError('wrong_state', 'No stage is awaiting a follow-up.');
    const guard = this.scanAnswer(answer);
    if (guard.state === 'blocked') {
      this.repo.updateSession(session.id, { status: 'sensitive_input_blocked' });
      throw new DomainError('sensitive_blocked', 'High-severity sensitive content detected.');
    }
    const ctx = this.toContext(session);
    this.repo.upsertResponse({
      sessionId: session.id,
      stageId: `FU-${stage}`,
      kind: 'followup',
      answer,
      extractedJson: [],
      sensitivityState: guard.state,
      qualityLabel: 'sufficient',
    });
    const outcome = sm.decideAfterFollowupAnswer(ctx);
    this.writeActive(session, outcome);
    const fresh = this.repo.getSessionById(session.id)!;
    const done = fresh.core_stage >= sm.MAX_CORE;
    return {
      assessment: emptyAssessment(this.lang(session)),
      nextCoreStage: this.currentCoreStageId(fresh),
      status: fresh.status,
      followupQuestion: null,
      followupCount: fresh.followup_count,
      allCoreAnswered: done,
      responseId: `FU-${stage}`,
    };
  }

  async skipStage(session: SessionRow): Promise<AnswerOutcome> {
    if (session.status !== 'in_progress') {
      throw new DomainError('wrong_state', `Cannot skip in state ${session.status}`);
    }
    const stage = this.currentCoreStageId(session);
    if (!stage) throw new DomainError('wrong_state', 'Nothing to skip.');
    const ctx = this.toContext(session);
    // if a follow-up was offered, skipping completes the stage (recorded unknown)
    this.repo.upsertResponse({
      sessionId: session.id,
      stageId: this.followupUsedForStage(session) ? `FU-${stage}` : stage,
      kind: 'skip',
      extractedJson: [{ statement: '', type: 'unknown', source_stage: stage, needs_validation: true }],
      sensitivityState: 'clear',
      qualityLabel: 'skipped',
    });
    const outcome = sm.decideAfterSkip(ctx);
    this.writeActive(session, outcome);
    const fresh = this.repo.getSessionById(session.id)!;
    const done = fresh.core_stage >= sm.MAX_CORE;
    return {
      assessment: emptyAssessment(this.lang(session)),
      nextCoreStage: this.currentCoreStageId(fresh),
      status: fresh.status,
      followupQuestion: null,
      followupCount: fresh.followup_count,
      allCoreAnswered: done,
      responseId: `skip-${stage}`,
    };
  }

  /** Edit an earlier answer: rewind to that stage, invalidate downstream. */
  async editAnswer(session: SessionRow, responseId: string, answer: string): Promise<{ rewoundToStage: string | null }> {
    const rows = this.activeResponses(session);
    const target = rows.find((r) => r.id === responseId);
    if (!target) throw new DomainError('not_found', 'Response not found for this session');
    const guard = this.scanAnswer(answer);
    if (guard.state === 'blocked') {
      throw new DomainError('sensitive_blocked', 'High-severity sensitive content detected.');
    }
    const stageIdx = target.stage_id.startsWith('Q')
      ? CORE_STAGES.indexOf(target.stage_id as CoreStageId)
      : -1;
    if (stageIdx === -1) throw new DomainError('invalid_stage', 'Only core answers can be edited.');

    // invalidate answers on later stages and reports (FR-009)
    const later = this.activeResponses(session).filter((r) => {
      const idx = r.stage_id.startsWith('Q') ? CORE_STAGES.indexOf(r.stage_id as CoreStageId) : 99;
      return idx > stageIdx;
    });
    const ts = new Date().toISOString();
    for (const l of later) {
      this.repo.db
        .prepare('UPDATE responses SET is_active = 0, superseded_at = ? WHERE id = ?')
        .run(ts, l.id);
    }
    this.repo.supersedeReportsForSession(session.id);
    this.repo.upsertResponse({
      sessionId: session.id,
      stageId: target.stage_id as CoreStageId,
      kind: 'core',
      answer,
      extractedJson: [],
      sensitivityState: guard.state,
      qualityLabel: sm.qualityOfAnswer(answer, target.stage_id as CoreStageId),
    });
    // rewind machine to the edited stage (core_stage = number completed before it)
    this.repo.updateSession(session.id, {
      core_stage: stageIdx,
      followup_count: 0,
      reflection_state: 'none',
      status: 'in_progress',
    });
    return { rewoundToStage: target.stage_id as CoreStageId };
  }

  /* ---------------- reflection ---------------- */

  async generateReflection(session: SessionRow): Promise<ReflectionOutput> {
    if (session.core_stage < sm.MAX_CORE) {
      throw new DomainError('wrong_state', 'All eight core stages must be completed first');
    }
    const rows = this.activeResponses(session);
    const substantive = rows.filter(
      (r) => r.kind === 'core' && r.quality_label && r.quality_label !== 'vague',
    ).length;
    if (substantive < sm.MIN_SUBSTANTIVE_FOR_REFLECTION) {
      throw new DomainError(
        'insufficient_input',
        `Reflection needs ≥${sm.MIN_SUBSTANTIVE_FOR_REFLECTION} substantive core answers (${substantive} provided).`,
      );
    }
    const answers = rows
      .filter((r) => r.kind === 'core')
      .map((r) => ({ stageId: r.stage_id, text: this.repo.readAnswerText(r) ?? '' }));
    const priorExtracted = rows
      .map((r) => {
        try {
          return JSON.parse(r.extracted_json ?? '[]') as Array<{
            statement: string;
            type: string;
            source_stage: string;
          }>;
        } catch {
          return [];
        }
      })
      .flat();
    const reflection = await this.llm.reflect({
      language: this.lang(session),
      lens: session.lens,
      answers,
      priorExtracted,
    });
    // cache reflection state without storing free text
    this.repo.updateSession(session.id, { reflection_state: 'ready', status: 'reflection_ready' });
    return reflection;
  }

  async confirmReflection(session: SessionRow, corrections: string): Promise<void> {
    if (session.reflection_state !== 'ready' && session.status !== 'reflection_ready') {
      throw new DomainError('wrong_state', 'Reflection is not ready for confirmation');
    }
    if (corrections && corrections.trim()) {
      this.repo.upsertResponse({
        sessionId: session.id,
        stageId: 'FU-corrections',
        kind: 'followup',
        answer: corrections.trim(),
        extractedJson: [],
        sensitivityState: 'clear',
        qualityLabel: 'sufficient',
      });
    }
    this.repo.updateSession(session.id, {
      reflection_state: 'confirmed',
      status: 'preview_ready',
      confirmed_at: new Date().toISOString(),
    });
  }

  /* ---------------- preview & report ---------------- */

  /** Preview requires confirmed reflection (FUNC-012/013). */
  async generatePreview(session: SessionRow): Promise<PreviewResponse> {
    if (session.reflection_state !== 'confirmed' && session.status !== 'preview_ready') {
      throw new DomainError('wrong_state', 'Preview requires a confirmed reflection');
    }
    const report = await this.ensureReport(session);
    const pending =
      report.decisionRecord.pendingOwnerDecisions?.[0] ??
      (report.riskReviews.length
        ? report.riskReviews[0]!.risk
        : 'Confirm owners and thresholds before execution.');
    return {
      schemaVersion: report.schemaVersion,
      language: report.language,
      strategyThesis: report.strategyThesis,
      pivotalChallenge: report.challengeDiagnosis.confirmedDiagnosis.text,
      proposedPriorities: report.actionPortfolio.slice(0, 3).map((a) => a.action),
      stopDefer: report.stopDefer[0]?.text ?? '',
      unresolvedTension: pending,
      readinessSnapshot: report.readinessSnapshot,
    };
  }

  async ensureReport(session: SessionRow): Promise<ReportOutput> {
    const existing = this.repo.getActiveReport(session.id);
    if (existing) return JSON.parse(existing.report_json) as ReportOutput;
    if (session.core_stage < sm.MAX_CORE) {
      throw new DomainError('wrong_state', 'Report requires all eight core stages');
    }
    const rows = this.activeResponses(session);
    const substantive = rows.filter(
      (r) => r.kind === 'core' && r.quality_label && r.quality_label !== 'vague',
    ).length;
    if (substantive < sm.MIN_SUBSTANTIVE_FOR_REFLECTION) {
      throw new DomainError(
        'insufficient_input',
        `Report needs ≥${sm.MIN_SUBSTANTIVE_FOR_REFLECTION} substantive core answers (${substantive} provided).`,
      );
    }
    const answers = rows
      .filter((r) => r.kind === 'core')
      .map((r) => ({ stageId: r.stage_id, text: this.repo.readAnswerText(r) ?? '' }));
    const priorExtracted = rows
      .map((r) => {
        try {
          return JSON.parse(r.extracted_json ?? '[]') as Array<{
            statement: string;
            type: string;
            source_stage: string;
          }>;
        } catch {
          return [];
        }
      })
      .flat();
    const reflection = await this.llm.reflect({
      language: this.lang(session),
      lens: session.lens,
      answers,
      priorExtracted,
    });
    const report = await this.llm.report({
      language: this.lang(session),
      lens: session.lens,
      roleBand: session.role_band,
      industryBand: session.industry_band,
      organizationAlias: session.organization_alias,
      answers,
      reflection,
    });
    report.language = this.lang(session);
    report.modelId = this.llm.meta.modelId;
    report.promptVersion = this.llm.meta.promptVersion;
    // strict server-side validation before any persistence/rendering (FR-012, REPORT-001)
    const check = reportOutputSchema.safeParse(report);
    if (!check.success) {
      logger.error('orchestration', 'report failed schema validation', {
        session: session.id,
        issues: check.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}`).join(','),
      });
      throw new DomainError('wrong_state', 'Report output was invalid and could not be repaired.');
    }
    this.repo.createReport(session.id, check.data);
    return check.data;
  }

  hasConsent(sessionId: string, purpose: string): boolean {
    return this.repo
      .listConsentsForSession(sessionId)
      .some((c) => c.purpose === purpose && c.granted === 1);
  }
}

function emptyAssessment(language: Language): AssessAnswerOutput {
  return {
    acknowledgment: language === 'zh-CN' ? '已收到。' : 'Noted.',
    answer_quality: 'sufficient',
    needs_followup: false,
    followup_question: null,
    extracted_items: [],
    sensitivity_flags: ['none'],
  };
}
