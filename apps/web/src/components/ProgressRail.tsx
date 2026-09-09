/**
 * ProgressRail — text-based question progress (8 core stages). Never relies on
 * color alone: each step shows its number and state glyphs + full text label.
 */
import { CORE_STAGES, dict, type Language } from '@2027strategy/shared';
import { fmt } from '../format';

export function ProgressRail({
  currentIndex,
  completed,
  lang,
}: {
  /** 0..7 for the presented stage, or null when the interview is complete. */
  currentIndex: number | null;
  /** stage ids (Q1..Q8 / FU-…) that have an active answer of any kind. */
  completed: string[];
  lang: Language;
}) {
  const t = dict(lang);
  const doneIds = new Set(completed.filter((id) => id.startsWith('Q')));
  const total = CORE_STAGES.length;

  return (
    <nav className="progress-rail" aria-label={fmt(t.interview.stageLabel, { current: currentIndex === null ? total : currentIndex + 1, total })}>
      <ol className="rail-steps">
        {CORE_STAGES.map((stage, i) => {
          const done = doneIds.has(stage) || (currentIndex !== null && i < currentIndex);
          const current = currentIndex === i;
          return (
            <li
              key={stage}
              className={[
                'rail-step',
                done ? 'is-done' : '',
                current ? 'is-current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="rail-step-marker" aria-hidden="true">
                {done ? '✓' : i + 1}
              </span>
              <span className="rail-step-text sr-only">
                {fmt(t.interview.progressLabel, { current: i + 1, total })}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
