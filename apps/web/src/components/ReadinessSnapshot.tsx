/**
 * Readiness snapshot — 5 dimensions, each Green / Amber / Red with an
 * explanation. No total score (see READINESS_LEVEL).
 */
import { dict, type Language, type ReadinessDimension, type ReadinessLevel } from '@2027strategy/shared';
import { fmt } from '../format';

export interface ReadinessItem {
  dimension: ReadinessDimension;
  level: ReadinessLevel;
  explanation: string;
}

const LEVEL_KEY: Record<ReadinessLevel, 'levelGreen' | 'levelAmber' | 'levelRed'> = {
  green: 'levelGreen',
  amber: 'levelAmber',
  red: 'levelRed',
} as const;

export function ReadinessSnapshot({
  items,
  lang,
  className,
}: {
  items: ReadinessItem[];
  lang: Language;
  className?: string;
}) {
  const t = dict(lang);
  return (
    <section className={`readiness ${className ?? ''}`} aria-label={t.preview.readinessTitle}>
      <h3 className="readiness-title">{t.preview.readinessTitle}</h3>
      <p className="readiness-hint">{t.preview.readinessHint}</p>
      <ul className="readiness-list">
        {items.map((item) => (
          <li key={item.dimension} className={`readiness-row readiness-${item.level}`}>
            <div className="readiness-row-head">
              <span className="readiness-dimension">
                {t.preview.dimensionLabels[item.dimension]}
              </span>
              <span className="readiness-level">
                <span className={`level-dot level-${item.level}`} aria-hidden="true" />
                {t.preview[LEVEL_KEY[item.level]]}
              </span>
            </div>
            <p className="readiness-explanation">{item.explanation}</p>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="readiness-empty">{t.common.loading}</p> : null}
    </section>
  );
}

export function progressLabel(t: ReturnType<typeof dict>, current: number, total: number): string {
  return fmt(t.interview.progressLabel, { current, total });
}
