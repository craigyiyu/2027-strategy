# Release Acceptance — 2026-09-09 build (private-beta MVP)

## Decision
**CONDITIONAL GO** — automated gates pass and AI quality is evidenced for the
quality personas; product-owner human sign-off is required for the remaining
manual rubric/visual/bilingual items before public launch.

## Environment
- Preview URL (this host): http://127.0.0.1:3317 (single-port API + SPA; deterministic mode)
- Commit: `32cda67` (HEAD at acceptance; see `git log`)
- Prompt version: `2026-09-09.1` · Schema version: `1.0` · Method: `mingce-1.0`
- Model route: deterministic-local (automated); deepseek-chat (live persona eval, opt-in)
- Test date: 2026-09-09

## Gates
| Gate | Status | Evidence |
|---|---|---|
| Automated build | PASS | typecheck 0 errors; web production build OK |
| Product behavior | PASS | 38 server unit/integration + 5 critical E2E (landing, anonymous happy path → 12-section report, admin auth + funnel, EN/ZH smoke, saved-report path) |
| AI quality | CONDITIONAL | live DeepSeek A–C produce full reports; rubric human scoring pending (test-evidence/ai-evaluations) |
| Trust and safety | PASS | sensitive blocking, consent independence, deletion + neutrality, cross-session, audited reveal, injection, token hash, encryption-at-rest tests green |
| Product owner acceptance | NOT COMPLETE | manual review runbook provided in test-evidence/manual-qa-runbook.md |

## Metrics
- P0 CSV cases: 80/99 Pass with automated evidence; 0 failing (19 Not Run = manual/AI-rubric by design — human authority per UAT plan)
- Release blockers (of 91): 74 Pass via E2E/integration/unit/AI fixtures; 17 pending human rubric/manual review
- Open S0/S1: 0 in automated suites
- AI rubric mean: PENDING human scoring (outputs archived)
- Traceability: provenance labels verified in report E2E (User fact/AI inference/Needs validation chips)
- Fabricated claims: live personas show 0 fabricated citations in sample review; rubric scoring pending
- Accessibility critical/serious: 0 (axe, 7 states)
- Mobile completion: 375px full core flow pass (no horizontal scroll; controls ≥44px)

## Accepted limitations / deviations
1. Editing previously-answered questions is bounded by the current server contract
   (the session API exposes stage ids, not response ids; the edit endpoint exists but
   the SPA surfaces it honestly). Proposed resolution: add response ids to the safe
   session payload in a follow-up iteration (DECISIONS.md D-xx).
2. Live LLM reports depend on deterministic schema normalizers; when the model output
   still fails after one repair the server returns a safe recoverable error (no state loss).
3. Email provider default = console log; SMTP adapter is implemented but requires DNS +
   credentials before real delivery.
4. Deletion receipts + consent confirmations are sent via the configured provider.
5. PNG source diagrams reviewed via their .mmd equivalents (model cannot ingest images).

## Required before public launch (owner decisions, not code)
1. Final public name and MingCe Chinese branding (DECISIONS.md §3).
2. Sender domain + transactional provider; launch jurisdictions + privacy counsel.
3. Final retention values; raw-answer admin policy; Pressure-Test booking destination.
4. GitHub repo `2027-strategy` creation and PR; CI first run.
5. Human review: AI nine-dimension rubric on archived persona outputs; manual a11y/perf/visual checklist.

## Sign-off
- Product owner: Craig (pending manual items above)
- Engineering: DSH implementation agent
- QA: DSH implementation agent
- Privacy/security reviewer: pending owner appointment
