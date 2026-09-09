/**
 * Shared zod schemas — single source of truth for API contracts and LLM
 * structured outputs (PRD §12, §14). Consumed by server (runtime validation)
 * and web (types). Never render from unvalidated data.
 */
import { z } from 'zod';
import {
  CONSENT_PURPOSE,
  CORE_STAGES,
  INDUSTRY_BAND,
  LANGUAGE,
  LENS,
  PRIVACY_MODE,
  PROVENANCE,
  READINESS_DIMENSION,
  READINESS_LEVEL,
  REPORT_LABEL,
  ROLE_BAND,
  SENSITIVITY_CATEGORY,
  SESSION_STATUS,
} from './constants';

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export const sessionCreateInput = z.object({
  language: z.enum(LANGUAGE),
  lens: z.enum(LENS),
  roleBand: z.enum(ROLE_BAND),
  industryBand: z.enum(INDUSTRY_BAND),
  organizationAlias: z.string().trim().min(1).max(120).optional(),
  privacyMode: z.enum(PRIVACY_MODE),
});
export type SessionCreateInput = z.infer<typeof sessionCreateInput>;

export const stageIdSchema = z.union([z.enum(CORE_STAGES), z.string().regex(/^FU-/)]);

export const answerInput = z.object({
  stageId: stageIdSchema,
  answer: z.string().trim().min(1).max(6000),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type AnswerInput = z.infer<typeof answerInput>;

export const editAnswerInput = z.object({
  answer: z.string().trim().min(1).max(6000),
});
export type EditAnswerInput = z.infer<typeof editAnswerInput>;

export const sessionSafeState = z.object({
  token: z.string(),
  language: z.enum(LANGUAGE),
  lens: z.enum(LENS),
  roleBand: z.enum(ROLE_BAND),
  industryBand: z.enum(INDUSTRY_BAND),
  privacyMode: z.enum(PRIVACY_MODE),
  organizationAlias: z.string().nullish(),
  status: z.enum(SESSION_STATUS),
  coreStage: z.number().int().min(0).max(8),
  followupCount: z.number().int().min(0).max(4),
  currentStageId: stageIdSchema.nullable(),
  methodVersion: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
  answeredStages: z.array(z.string()),
  reportAvailable: z.boolean(),
  reflectionState: z.enum(['none', 'ready', 'confirmed']),
});
export type SessionSafeState = z.infer<typeof sessionSafeState>;

/* ------------------------------------------------------------------ */
/* LLM Call A — Assess answer (PRD 12.2)                               */
/* ------------------------------------------------------------------ */

export const extractedItemSchema = z.object({
  statement: z.string().min(1),
  type: z.enum([
    'user_fact',
    'user_assumption',
    'user_preference',
    'constraint',
    'unknown',
  ]),
  source_stage: z.string().min(1),
  needs_validation: z.boolean(),
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const assessAnswerOutput = z
  .object({
    acknowledgment: z.string().min(1),
    answer_quality: z.enum([
      'sufficient',
      'vague',
      'contradictory',
      'activity_not_outcome',
      'too_many_priorities',
      'missing_tradeoff',
      'missing_evidence',
    ]),
    needs_followup: z.boolean(),
    followup_question: z.string().min(1).nullable(),
    extracted_items: z.array(extractedItemSchema).max(24),
    sensitivity_flags: z.array(z.enum(SENSITIVITY_CATEGORY)).default(['none']),
  })
  .superRefine((val, ctx) => {
    if (!val.needs_followup && val.followup_question !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['followup_question'],
        message: 'followup_question must be null when needs_followup is false',
      });
    }
    if (val.needs_followup && (val.followup_question === null || val.followup_question === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['followup_question'],
        message: 'followup_question is required when needs_followup is true',
      });
    }
  });
export type AssessAnswerOutput = z.infer<typeof assessAnswerOutput>;

/** Server-normalized assessment: provenance items pinned to canonical type set. */
const QUALITY_LITERAL = [
  'sufficient',
  'vague',
  'contradictory',
  'activity_not_outcome',
  'too_many_priorities',
  'missing_tradeoff',
  'missing_evidence',
] as const;

export const assessmentRecord = z.object({
  acknowledgment: z.string(),
  answerQuality: z.enum(QUALITY_LITERAL),
  needsFollowup: z.boolean(),
  followupQuestion: z.string().nullable(),
  extractedItems: z.array(extractedItemSchema),
  sensitivityFlags: z.array(z.enum(SENSITIVITY_CATEGORY)),
});
export type AssessmentRecord = z.infer<typeof assessmentRecord>;

/* ------------------------------------------------------------------ */
/* LLM Call B — Reflection (PRD 12.3)                                  */
/* ------------------------------------------------------------------ */

export const candidateDiagnosisSchema = z.object({
  diagnosis: z.string().min(1),
  support: z.array(z.string()).max(12),
  counter_evidence: z.array(z.string()).max(12),
});
export type CandidateDiagnosis = z.infer<typeof candidateDiagnosisSchema>;

export const reflectionOutput = z.object({
  decision: z.string().min(1),
  facts: z.array(z.string()).max(24),
  assumptions: z.array(z.string()).max(24),
  candidate_diagnoses: z.array(candidateDiagnosisSchema).max(5),
  proposed_crux: z.string().min(1),
  conflicts: z.array(z.string()).max(12),
  missing_evidence: z.array(z.string()).max(12),
});
export type ReflectionOutput = z.infer<typeof reflectionOutput>;

export const confirmReflectionInput = z.object({
  corrections: z.string().trim().max(4000).optional().default(''),
  confirmation: z.literal('confirm'),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type ConfirmReflectionInput = z.infer<typeof confirmReflectionInput>;

/* ------------------------------------------------------------------ */
/* Provenance-rich statement used inside the report                    */
/* ------------------------------------------------------------------ */

export const reportStatementSchema = z.object({
  text: z.string().min(1).max(2000),
  label: z.enum(REPORT_LABEL),
  sourceResponseId: z.string().nullable().optional(),
  sourceStage: z.string().nullable().optional(),
  note: z.string().max(400).nullable().optional(),
});
export type ReportStatement = z.infer<typeof reportStatementSchema>;

/* ------------------------------------------------------------------ */
/* LLM Call C — Preview & report (PRD 12.4 + §10 S-08)                 */
/* ------------------------------------------------------------------ */

export const previewOutput = z.object({
  strategyThesis: z.string().min(1).max(400),
  pivotalChallenge: z.string().min(1).max(600),
  proposedPriorities: z.array(z.string()).min(1).max(3),
  stopDefer: z.string().min(1).max(600),
  unresolvedTension: z.string().min(1).max(600),
  readinessSnapshot: z
    .array(
      z.object({
        dimension: z.enum(READINESS_DIMENSION),
        level: z.enum(READINESS_LEVEL),
        explanation: z.string().min(1).max(500),
      }),
    )
    .length(5),
});
export type PreviewOutput = z.infer<typeof previewOutput>;

export const strategicAlternativeSchema = z.object({
  name: z.string().min(1).max(120),
  guidingPolicy: z.string().min(1).max(800),
  whereToPlay: z.string().min(1).max(600),
  howToWin: z.string().min(1).max(600),
  tradeoffs: z.array(reportStatementSchema).max(8),
});
export type StrategicAlternative = z.infer<typeof strategicAlternativeSchema>;

export const assumptionEntrySchema = z.object({
  assumption: z.string().min(1).max(600),
  label: z.enum(REPORT_LABEL),
  sourceResponseId: z.string().nullable().optional(),
  sourceStage: z.string().nullable().optional(),
  importance: z.enum(['critical', 'important', 'secondary']),
  evidenceState: z.enum(['supported', 'plausible', 'unvalidated', 'contested']),
});
export type AssumptionEntry = z.infer<typeof assumptionEntrySchema>;

export const evidenceGateSchema = z.object({
  owner: z.string().min(1).max(160),
  test: z.string().min(1).max(600),
  threshold: z.string().min(1).max(400),
  reviewDate: z.string().min(1).max(80),
  decisionRule: z.enum(['continue', 'adjust', 'pause', 'exit']),
  measure: z.string().min(1).max(400),
});
export type EvidenceGate = z.infer<typeof evidenceGateSchema>;

export const actionSchema = z.object({
  action: z.string().min(1).max(500),
  owner: z.string().min(1).max(160),
  milestone: z.string().min(1).max(300),
  supportsPriority: z.string().min(1).max(200),
});
export type ActionItem = z.infer<typeof actionSchema>;

export const executionMeasureSchema = z.object({
  measure: z.string().min(1).max(400),
  kind: z.enum(['outcome', 'driver', 'early_warning']),
  dataSource: z.string().min(1).max(300),
  owner: z.string().min(1).max(160),
  cadence: z.string().min(1).max(120),
});
export type ExecutionMeasure = z.infer<typeof executionMeasureSchema>;

export const riskReviewSchema = z.object({
  risk: z.string().min(1).max(600),
  area: z.enum([
    'privacy',
    'security',
    'regulatory',
    'capital',
    'reputation',
    'operations',
    'financial',
  ]),
  requiresHumanApproval: z.boolean(),
  reviewOwner: z.string().min(1).max(160),
  label: z.enum(REPORT_LABEL).default('ai_inference'),
  sourceResponseId: z.string().nullable().optional(),
  sourceStage: z.string().nullable().optional(),
});
export type RiskReview = z.infer<typeof riskReviewSchema>;

export const reportOutput = z.object({
  schemaVersion: z.string().default('1.0'),
  language: z.enum(LANGUAGE),
  modelId: z.string().default('unknown'),
  promptVersion: z.string().default('unknown'),
  generatedAt: z.string().default(() => new Date().toISOString()),
  strategyThesis: z.string().min(1).max(400),
  preview: previewOutput.shape.readinessSnapshot.optional(),
  // 1 Decision Brief
  decisionBrief: z.object({
    decision: reportStatementSchema,
    scope: z.array(reportStatementSchema).max(12),
    deadline: z.string().min(1).max(200),
    approver: z.string().min(1).max(200),
    hardConstraints: z.array(reportStatementSchema).max(12),
  }),
  // 2 Evidence Base
  evidenceBase: z.array(reportStatementSchema).max(60),
  // 3 Challenge Diagnosis
  challengeDiagnosis: z.object({
    symptoms: z.array(reportStatementSchema).max(12),
    candidateDiagnoses: z.array(candidateDiagnosisSchema).max(5),
    confirmedDiagnosis: reportStatementSchema,
  }),
  // 4 The Crux
  crux: z.object({
    cruxStatement: reportStatementSchema,
    whyNow: z.array(reportStatementSchema).max(8),
    alternativesConsidered: z.array(z.string()).max(8),
  }),
  // 5 Strategic Alternatives
  strategicAlternatives: z.array(strategicAlternativeSchema).min(2).max(4),
  // 6 Choice Contract
  choiceContract: z.object({
    winningAspiration: reportStatementSchema,
    whereToPlay: reportStatementSchema,
    howToWin: reportStatementSchema,
    requiredCapabilities: z.array(reportStatementSchema).max(12),
    managementSystems: z.array(reportStatementSchema).max(8),
  }),
  // 7 Assumption & Economics Register
  assumptionRegister: z.array(assumptionEntrySchema).max(30),
  reverseEconomics: z.object({
    mustBeTrueForValue: z.array(z.string()).max(8),
    mustBeTrueForCost: z.array(z.string()).max(8),
    statements: z.array(reportStatementSchema).max(8).optional(),
  }),
  // 8 Evidence Gates
  evidenceGates: z.array(evidenceGateSchema).min(1).max(6),
  // 9 Coherent Action Portfolio + Stop/Defer
  actionPortfolio: z.array(actionSchema).max(16),
  stopDefer: z.array(reportStatementSchema).min(1).max(10),
  // 10 Execution Evidence Map
  executionMeasures: z.array(executionMeasureSchema).max(24),
  // 11 Risk & Expert Review
  riskReviews: z.array(riskReviewSchema).max(20),
  // 12 Decision Record & Revisit Triggers
  decisionRecord: z.object({
    confirmedDecision: reportStatementSchema,
    pendingOwnerDecisions: z.array(z.string()).max(10),
    revisitTriggers: z.array(z.string()).max(10),
    reviewCadence: z.string().max(300),
    approvedBy: z.array(z.string()).max(10),
  }),
  readinessSnapshot: z.array(
    z.object({
      dimension: z.enum(READINESS_DIMENSION),
      level: z.enum(READINESS_LEVEL),
      explanation: z.string().min(1).max(500),
    }),
  ),
  limitations: z.array(z.string()).max(12),
  stopDeferExplicit: z.boolean().default(true),
});
export type ReportOutput = z.infer<typeof reportOutput>;

export const previewResponse = z.object({
  schemaVersion: z.string(),
  language: z.enum(LANGUAGE),
  strategyThesis: z.string(),
  pivotalChallenge: z.string(),
  proposedPriorities: z.array(z.string()).max(3),
  stopDefer: z.string(),
  unresolvedTension: z.string(),
  readinessSnapshot: z.array(
    z.object({
      dimension: z.enum(READINESS_DIMENSION),
      level: z.enum(READINESS_LEVEL),
      explanation: z.string(),
    }),
  ),
});
export type PreviewResponse = z.infer<typeof previewResponse>;

/* ------------------------------------------------------------------ */
/* Consent, delivery, feedback, deletion                               */
/* ------------------------------------------------------------------ */

export const consentFlags = z.object({
  reportDelivery: z.boolean().default(true),
  newsletter: z.boolean().default(false),
  pulse: z.boolean().default(false),
  followup: z.boolean().default(false),
});
export type ConsentFlags = z.infer<typeof consentFlags>;

export const setDeliveryInput = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .toLowerCase()
      .optional()
      .refine((v) => v === undefined || v === '' || /.+@.+\..+/.test(v), {
        message: 'Enter a valid email address.',
      }),
    firstName: z.string().trim().max(80).optional(),
    consents: consentFlags,
    reportToken: z.string().trim().min(8).max(200).optional(),
    idempotencyKey: z.string().trim().min(8).max(64),
  })
  .superRefine((val, ctx) => {
    if (val.email && val.email.length > 0 && !val.consents.reportDelivery) {
      ctx.addIssue({
        code: 'custom',
        path: ['consents', 'reportDelivery'],
        message: 'Report delivery consent is required to email the report.',
      });
    }
  });
export type SetDeliveryInput = z.infer<typeof setDeliveryInput>;

export const feedbackInput = z.object({
  rating: z.number().int().min(1).max(5),
  mostHelpfulQuestion: z.string().trim().max(300).optional(),
  leastHelpfulQuestion: z.string().trim().max(300).optional(),
  comments: z.string().trim().max(3000).optional(),
  followupRequested: z.boolean().default(false),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

export const deleteInput = z.object({
  confirmation: z.literal('delete'),
});
export type DeleteInput = z.infer<typeof deleteInput>;

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const adminRevealInput = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type AdminRevealInput = z.infer<typeof adminRevealInput>;

export const funnelMetrics = z.object({
  landingVisits: z.number().int().min(0),
  interviewStarts: z.number().int().min(0),
  stageFunnel: z.record(z.string(), z.number().int().min(0)),
  previewReached: z.number().int().min(0),
  fullReportGenerated: z.number().int().min(0),
  emailDeliveryRate: z.number().min(0).max(1),
  optInCounts: z.object({
    newsletter: z.number().int().min(0),
    pulse: z.number().int().min(0),
    followup: z.number().int().min(0),
  }),
  priorityCategories: z.array(
    z.object({
      category: z.string(),
      count: z.number().int().min(0),
      suppressed: z.boolean(),
    }),
  ),
  byLanguage: z.record(z.string(), z.number().int().min(0)).optional(),
  byLens: z.record(z.string(), z.number().int().min(0)).optional(),
});
export type FunnelMetrics = z.infer<typeof funnelMetrics>;
