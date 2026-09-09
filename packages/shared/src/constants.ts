/**
 * 2027 Strategy — shared domain constants, enums & version metadata.
 * Single source of truth consumed by server, web and tests.
 */

export const METHOD_NAME_EN = 'MingCe Evidence Loop';
export const METHOD_NAME_ZH = '明策证据环';
export const METHOD_BADGE_ZH = '明策证据环｜问题先行 · 选择成链 · 证据过门 · 人类定责';
export const METHOD_BADGE_EN =
  'MingCe Evidence Loop — Diagnose first. Make choices. Gate with evidence. Keep humans accountable.';
export const METHOD_VERSION = 'mingce-1.0';
export const PROMPT_VERSION = '2026-09-09.1';
export const SCHEMA_VERSION = '1.0';
export const POLICY_VERSION = '2026-09-09.1';
export const PRODUCT_NAME = '2027 Strategy';
export const PRODUCT_VERSION = '0.1.0-private-beta';

export const REPORT_SECTION_COUNT = 12;
export const CORE_STAGE_COUNT = 8;
export const MAX_FOLLOWUPS_PER_STAGE = 1;
export const MAX_FOLLOWUPS_PER_SESSION = 4;
export const MIN_SUBSTANTIVE_FOR_REFLECTION = 5;
export const MAX_PRIORITIES = 3;
export const PULSE_MIN_CELL_DEFAULT = 20;

/** Independent-implementation disclaimer (PRD §6.2) — exact copy. */
export const DISCLAIMER_EN =
  'This is an independent implementation inspired by published strategy work. It is not an official, certified, authorized or endorsed product of the referenced authors, publishers or institutions. AI output supports—but does not replace—executive, legal, financial, compliance, risk or technical judgment.';
export const DISCLAIMER_ZH =
  '本产品是独立设计，参考公开发表的战略著作思想，并非上述作者、出版方或机构的官方、认证或背书产品。AI 输出用于辅助——而非取代——高管、法务、财务、合规、风险或技术判断。';

export const LANGUAGE = ['en', 'zh-CN'] as const;
export type Language = (typeof LANGUAGE)[number];

export const LENS = ['technology', 'business', 'leadership'] as const;
export type Lens = (typeof LENS)[number];

export const ROLE_BAND = ['c_suite', 'director_vp', 'owner', 'senior_manager', 'other'] as const;
export type RoleBand = (typeof ROLE_BAND)[number];

export const INDUSTRY_BAND = [
  'integrated_resort_hospitality',
  'technology',
  'financial_services',
  'professional_services',
  'consumer',
  'public_nonprofit',
  'other',
] as const;
export type IndustryBand = (typeof INDUSTRY_BAND)[number];

export const PRIVACY_MODE = ['private', 'save'] as const;
export type PrivacyMode = (typeof PRIVACY_MODE)[number];

export const CORE_STAGES = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'] as const;
export type CoreStageId = (typeof CORE_STAGES)[number];

export const FOLLOWUP_STAGE_PREFIX = 'FU' as const;

export const SESSION_STATUS = [
  'created',
  'in_progress',
  'reflection_ready',
  'reflection_confirmed',
  'preview_ready',
  'delivery_choice',
  'report_ready',
  'completed',
  'sensitive_input_blocked',
  'expired',
  'deleted',
] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];

export const PROVENANCE = [
  'user_fact',
  'user_assumption',
  'user_preference',
  'constraint',
  'ai_inference',
  'needs_validation',
  'human_decision',
  'unknown',
] as const;
export type Provenance = (typeof PROVENANCE)[number];

/** User-visible provenance labels (PRD §22.2). */
export const PROVENANCE_LABELS_EN: Record<Provenance, string> = {
  user_fact: 'User fact',
  user_assumption: 'User assumption',
  user_preference: 'User preference',
  constraint: 'Constraint',
  ai_inference: 'AI inference',
  needs_validation: 'Needs validation',
  human_decision: 'Human decision',
  unknown: 'Unknown',
};
export const PROVENANCE_LABELS_ZH: Record<Provenance, string> = {
  user_fact: '用户事实',
  user_assumption: '用户假设',
  user_preference: '用户偏好',
  constraint: '约束条件',
  ai_inference: 'AI 推断',
  needs_validation: '待验证',
  human_decision: '人工决定',
  unknown: '未知',
};
export function provenanceLabel(p: Provenance, lang: Language): string {
  return lang === 'zh-CN' ? PROVENANCE_LABELS_ZH[p] : PROVENANCE_LABELS_EN[p];
}

/** Compact provenance classes used in report data (extended labels rendered client-side). */
export const REPORT_LABEL = [
  'user_fact',
  'user_assumption',
  'ai_inference',
  'needs_validation',
  'human_decision',
] as const;
export type ReportLabel = (typeof REPORT_LABEL)[number];
export const REPORT_LABELS_EN: Record<ReportLabel, string> = {
  user_fact: 'User fact',
  user_assumption: 'User assumption',
  ai_inference: 'AI inference',
  needs_validation: 'Needs validation',
  human_decision: 'Human decision',
};
export const REPORT_LABELS_ZH: Record<ReportLabel, string> = {
  user_fact: '用户事实',
  user_assumption: '用户假设',
  ai_inference: 'AI 推断',
  needs_validation: '待验证',
  human_decision: '人工决定',
};

export const QUALITY_LABEL = [
  'sufficient',
  'vague',
  'contradictory',
  'activity_not_outcome',
  'too_many_priorities',
  'missing_tradeoff',
  'missing_evidence',
  'skipped',
] as const;
export type QualityLabel = (typeof QUALITY_LABEL)[number];

export const SENSITIVITY_STATE = ['clear', 'warning', 'blocked', 'redacted'] as const;
export type SensitivityState = (typeof SENSITIVITY_STATE)[number];

export const SENSITIVITY_CATEGORY = [
  'none',
  'credential',
  'personal_data',
  'security_detail',
  'confidential_financial',
] as const;
export type SensitivityCategory = (typeof SENSITIVITY_CATEGORY)[number];

export const CONSENT_PURPOSE = [
  'report_delivery',
  'newsletter',
  'pulse',
  'followup',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSE)[number];

export const VERIFICATION_STATE = ['pending', 'verified', 'bounced'] as const;
export type VerificationState = (typeof VERIFICATION_STATE)[number];

export const REPORT_STATUS = ['generating', 'ready', 'superseded', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

export const READINESS_DIMENSION = [
  'diagnosis_clarity',
  'choice_clarity',
  'evidence_readiness',
  'execution_ownership',
  'risk_governance',
] as const;
export type ReadinessDimension = (typeof READINESS_DIMENSION)[number];

export const READINESS_LEVEL = ['green', 'amber', 'red'] as const;
export type ReadinessLevel = (typeof READINESS_LEVEL)[number];

/** Hard human-approval gate areas (Methodology §8) — cannot be scored away. */
export const HUMAN_APPROVAL_AREAS = [
  'gaming_licence_regulatory',
  'aml_kyc_sanctions',
  'responsible_gaming',
  'guest_member_employee_data_privacy',
  'cyber_resilience_incident',
  'ai_model_governance_vendor',
  'large_capital_irreversible',
  'guest_employee_safety',
  'labour_community_reputation',
] as const;
export type HumanApprovalArea = (typeof HUMAN_APPROVAL_AREAS)[number];
