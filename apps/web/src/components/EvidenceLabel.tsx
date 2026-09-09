/**
 * Evidence provenance chip — renders label + dot from the shared provenance
 * label dictionaries. Text is always present so meaning never relies on
 * color alone.
 */
import {
  PROVENANCE_LABELS_EN,
  PROVENANCE_LABELS_ZH,
  REPORT_LABELS_EN,
  REPORT_LABELS_ZH,
  type Language,
} from '@2027strategy/shared';

type ProvenanceKey =
  | 'user_fact'
  | 'user_assumption'
  | 'user_preference'
  | 'constraint'
  | 'ai_inference'
  | 'needs_validation'
  | 'human_decision'
  | 'unknown';

function labelFor(key: string, lang: Language): string {
  const en = REPORT_LABELS_EN[key as keyof typeof REPORT_LABELS_EN];
  if (en) return lang === 'zh-CN' ? REPORT_LABELS_ZH[key as keyof typeof REPORT_LABELS_ZH] : en;
  const p = PROVENANCE_LABELS_EN[key as ProvenanceKey];
  if (p) return lang === 'zh-CN' ? PROVENANCE_LABELS_ZH[key as ProvenanceKey] : p;
  return key;
}

export function EvidenceLabel({
  label,
  lang,
  className,
}: {
  label: string;
  lang: Language;
  className?: string;
}) {
  const text = labelFor(label, lang);
  return (
    <span className={`evidence-label ${className ?? ''}`} data-evidence={label}>
      <span className="evidence-dot" aria-hidden="true" />
      {text}
    </span>
  );
}

export function provenanceClassName(key: string): string {
  return `evidence-${key}`;
}
