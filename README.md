# 2027 Strategy — MingCe Evidence Loop

Privacy-first, AI-assisted executive planning web application. A 10–15 minute
guided strategy sprint that ends in an evidence-labelled, decision-ready
**2027 Strategy Brief** (English + 简体中文).

Independent implementation inspired by published strategy work (Rumelt;
Lafley & Martin; McGrath & MacMillan; Kaplan & Norton). **No affiliation or
endorsement** — see `/method` and `DECISIONS.md`.

## Repo layout

```text
2027-Strategy-*.md / .csv / .png / .mmd   — source specification (PRD, methodology, UAT plan/cases, diagrams)
IMPLEMENTATION_PLAN.md                     — milestone 0 requirements map
DECISIONS.md                               — accepted decisions & owner decisions
packages/shared/                           — zod schemas, i18n (EN/zh-CN), question content, sensitive scanner, fixtures
packages/server/                           — Hono API, state machine, LLM adapters, email, admin, SQLite
apps/web/                                  — React + Vite SPA
test-evidence/                             — QA evidence (per UAT plan)
.github/workflows/ci.yml                   — typecheck, unit/integration tests, build
```

## Setup

```bash
pnpm install
cp .env.example .env          # fill ENCRYPTION_KEY, ADMIN_TOKEN, optionally DEEPSEEK_API_KEY
pnpm dev                      # server :3317 + web :5173 (proxy /api -> :3317)
```

- `LLM_MODE=deterministic` (default): fully offline, no API key needed. Output
  is schema-valid but conservative (heavy `Needs validation` labelling).
- `LLM_MODE=live` + `DEEPSEEK_API_KEY`: server-side DeepSeek calls with strict
  JSON + one schema-repair attempt.
- `EMAIL_PROVIDER=console` (default) logs emails; SMTP adapter available via
  `EMAIL_PROVIDER=smtp` + `SMTP_*` env.

## Tests

```bash
pnpm test                        # unit + integration (fake/deterministic models — no credits)
pnpm --filter @2027strategy/web build
pnpm eval:live                   # opt-in live-model persona evaluation (writes test-evidence/)
```

## Privacy highlights

- Anonymous start; email appears only **after** the preview.
- Session + report capability tokens: 256-bit random, **only SHA-256 hashes stored**.
- Answers encrypted at rest (AES-256-GCM).
- Report delivery / newsletter / Pulse / follow-up consents are **separate and
  unchecked by default**.
- Raw answers never reach analytics; admin reveal is audited.
- Deletion is end-to-end, idempotent and neutral about prior existence.

Source of truth for behaviour: `2027-Strategy-PRD.md` and
`2027-Strategy-UAT-Test-Cases.csv` (release blockers). Deviations tracked in
`DECISIONS.md`.
