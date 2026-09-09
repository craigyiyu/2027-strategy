# Automated results — 2026-09-09 (private-beta build)

Run: typecheck + unit/integration + Playwright E2E + axe accessibility against a
deterministic (no-key) server, plus opt-in live DeepSeek persona evaluation.

## Gates
| Suite | Result |
|---|---|
| Typecheck (shared/server/web) | PASS (0 errors) |
| Unit + integration tests | PASS (shared 8 + server 38) |
| Playwright critical E2E (landing, anonymous happy path, admin, EN/ZH smoke, saved report) | 5 passed |
| axe WCAG A/AA (landing, method, privacy, report, interview+error, reflection) | 0 critical/serious |
| Method/privacy disclosure, Chinese provenance terms, 375px no-h-scroll, image-off resilience | 3 passed |
| Live-model personas (DeepSeek chat) | A–C full 12-section reports; D/E correct insufficient-input refusal |

## CSV case inventory
- 99 cases; automated evidence marks 63 Pass; 36 Not Run (AI rubric manual scoring,
  manual a11y/perf/visual/bilingual-review items pending human owner review).
- Release blockers: see 2027-Strategy-UAT-Test-Cases.csv Status column.
