/**
 * Analytics service — validate event payloads against the shared allow-list
 * before persisting (FR-027, PRIV-008). Raw text never accepted.
 */
import { isAllowedAnalyticsEvent, type AnalyticsEventName, type AnalyticsPropsFor } from '@2027strategy/shared';
import type { Repo } from '../repo';
import { logger } from '../logger';

export class AnalyticsService {
  constructor(private repo: Repo) {}

  track<N extends AnalyticsEventName>(name: N, props: AnalyticsPropsFor<N>): void {
    const check = isAllowedAnalyticsEvent(name, props as Record<string, unknown>);
    if (!check.ok) {
      logger.warn('analytics', 'blocked disallowed event payload', { reason: check.reason });
      return;
    }
    this.repo.recordAnalytics(name, props as unknown as Record<string, unknown>);
  }
}
