/**
 * Analytics event catalog — PRD §16. Raw answer/email/name/report content is
 * NEVER an allowed property. The server analytics service validates payloads
 * against this allow-list before writing.
 */

export const ANALYTICS_EVENTS = {
  landing_viewed: ['locale', 'campaign', 'deviceClass'],
  start_clicked: ['locale', 'campaign'],
  session_created: ['lens', 'roleBand', 'industryBand', 'privacyMode'],
  stage_viewed: ['stageId', 'followup'],
  stage_completed: ['stageId', 'elapsedBucket', 'skipped'],
  sensitive_warning_shown: ['category'],
  reflection_viewed: ['completionBucket'],
  reflection_confirmed: ['correctionBucket'],
  preview_viewed: ['readinessCounts'],
  delivery_selected: ['emailYesNo', 'consentFlags'],
  report_generated: ['language', 'lens', 'elapsedBucket', 'modelRoute'],
  report_print_clicked: ['language'],
  feedback_submitted: ['rating', 'followupRequested'],
  deletion_requested: ['privacyMode'],
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsPropsFor<N extends AnalyticsEventName> = Partial<
  Record<(typeof ANALYTICS_EVENTS)[N][number], string | number | boolean>
>;

export function isAllowedAnalyticsEvent(
  name: string,
  props: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const allowed = (ANALYTICS_EVENTS as Record<string, readonly string[]>)[name];
  if (!allowed) return { ok: false, reason: `unknown event ${name}` };
  for (const key of Object.keys(props)) {
    if (!allowed.includes(key)) return { ok: false, reason: `disallowed property ${key}` };
  }
  return { ok: true };
}
