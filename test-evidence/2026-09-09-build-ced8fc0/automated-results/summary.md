# Automated results — final battery (2026-09-09)

Deterministic no-key server; Playwright Chromium; axe-core; opt-in DeepSeek eval archived.

| Suite | Result |
|---|---|
| Typecheck (shared/server/web) | PASS, 0 errors |
| Unit + integration | PASS — shared 8, server 43 (state machine, limits, tokens, encryption, sensitive, injection, consent, deletion, idempotency, schema, retention, email failure, admin export, AI fixtures) |
| Playwright E2E | PASS — 22 scenarios |
| axe WCAG A/AA | PASS — landing, method, privacy, report, interview+error, reflection: 0 critical/serious |
| Live-model personas | DeepSeek chat: A–C full 12-section reports; D/E correct insufficient-input refusal |

## E2E scenario groups
- core.spec (5): landing/no-email, anonymous happy path → report, admin auth+funnel, EN/ZH smoke, saved-report/email path
- accessibility.spec (3): axe scans across 7 states
- method_privacy_mobile.spec (3): method disclosure & IP boundary, zh mandated provenance terms, 375px no-h-scroll + images-off
- p0-extra.spec (4): full zh UI flow (LOC-001), keyboard-only flow (A11Y-001), print + 200% zoom (FUNC-018/A11Y-005), no imagery clichés (VIS-003)
- p0-reliability.spec (6): autosave truth (FUNC-011), zh persistence (LOC-004), offline recovery (PERF-003), text progress (A11Y-004), reduced motion (A11Y-006), delayed-AI feedback + no duplicate (PERF-002)

## CSV case inventory
- 99 cases → **80 Pass** (automated evidence), 19 Not Run
- Not Run are human-authority items per UAT plan §6.1/§9.2: AI nine-dimension rubric scoring (AI-001..007, 009, 013..016, 018..020), screen-reader announcement check (A11Y-003), date-format review (LOC-003), perf benchmarks (PERF-001/004)
- Release blockers: 74/91 evidenced Pass; 17 pending human review
