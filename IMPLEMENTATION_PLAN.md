# IMPLEMENTATION_PLAN.md — 2027 Strategy (MingCe Evidence Loop)

**Milestone 0 — Requirements map** (Developer Agent Brief)
**Date:** 2026-09-09
**Spec sources of truth (read fully before coding):**
1. `2027-Strategy-PRD.md` v1.0 — authoritative product requirements
2. `2027-Strategy-Copilot-Methodology.md` — method hierarchy, attribution & IP boundaries
3. `2027-Strategy-Visual-Prompts.md` — visual direction
4. `2027-Strategy-UAT-Test-Plan.md` — release strategy & quality thresholds
5. `2027-Strategy-UAT-Test-Cases.csv` — 99 executable cases (91 release blockers, 37 P0 FRs mapped)
6. `2027-strategy-tool-flow.png/.mmd`, `2027-strategy-methodology-stack.png/.mmd` — journey & method diagrams
7. `2027-Strategy-Copilot-Blueprint.md` — product/growth design reference

**Requirement authority order (non-negotiable):**
Privacy & safety > P0 functional requirements > AI schema & server-owned state machine > UAT acceptance criteria > visual preferences.

Any infeasible requirement → record in `DECISIONS.md` (requirement ID, reason, impact, risk, temporary behavior, proposed resolution). Never silently remove a P0.

---

## 1. Chosen Stack

| Concern | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces (`packages/*`, `apps/*`) | Single install, typed cross-package sharing |
| Language | TypeScript strict everywhere (shared/server/web) | Full-stack TS per brief |
| Frontend | React 18 + Vite 5 SPA + React Router | Bilingual route map; fast shell |
| Backend | Node 22 + **Hono** (typed endpoints) + `@hono/node-server` | Small, typed, runtime-validation friendly |
| Runtime validation | **zod** shared schemas (one source of truth) | Strict typed RPC w/ runtime validation |
| Database | **SQLite via better-sqlite3** (relational; WAL) | Relational requirement; zero-ops private beta |
| Token entropy | `crypto.randomBytes(32)` → base64url (256-bit); store **SHA-256 hash only** | SEC-02 (≥128 bits) |
| Answer-at-rest protection | AES-256-GCM per-response encryption with server-side key from env | SEC-06 "where platform support permits" |
| LLM | DeepSeek (OpenAI-compatible, server-side) + **FakeModelAdapter** (CI) + **deterministic fallback** (no-key mode) | Configurable model; no hardcoded catalog |
| Email | `EmailService` interface; providers: Console (sandbox/dev), SMTP, Resend-shaped adapter | Provider-adapter transactional email |
| Auth (admin) | Single-owner admin token (env `ADMIN_TOKEN`), constant-time compare; role-protected routes | SEC-07 for private beta; expand later |
| Analytics | In-house minimal event table; raw text never included | FR-027/PRIV-008 |
| CI | GitHub Actions: typecheck, unit, integration, critical E2E, `pnpm audit`, secret scan (gitleaks) | Brief repository section |
| E2E | Playwright (Chromium) for P0 flows + axe-core | A11Y-002, E2E cases |
| Icons/images | Inline SVG, CSS-only graphics; max 3 optional generated images | Image policy §18.2 |
| Fonts | Editorial serif (Literata/Newsreader via fontsource) + Inter/IBM Plex Sans; system fallbacks | Visual tokens |

### Workspace layout

```text
2027 Strategy tool/            (repo root; docs live at root per PRD links)
├── IMPLEMENTATION_PLAN.md      (this file)
├── DECISIONS.md                (accepted deviations & owner decisions)
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
├── .env.example
├── .github/workflows/ci.yml
├── docs/notes/                 (internal notes; source docs stay at root)
├── packages/
│   ├── shared/                 zod schemas, enums, i18n dictionaries, question/content engine,
│   │                           prompt library (versioned), report schema, analytics event defs
│   └── server/                 Hono API, orchestration, services, db migrations, admin
├── apps/
│   └── web/                    React SPA (routes + components + styles + print CSS)
└── test-evidence/              QA evidence per UAT plan (dated folders)
```

---

## 2. Requirement → Task Map (P0 functional)

Legend: `core` = shared/server module, `web` = client module, test column lists CSV case IDs covering it.

| Req | Requirement | Implementation task | Module | CSV cases |
|---|---|---|---|---|
| FR-001 | Start w/o email/login/company | Anonymous session create endpoint; no email field on landing/start | server `session.create`; web Start | FUNC-001, PRIV-001 |
| FR-002 | EN / 简体中文 selection | i18n provider + locale registry; every string localized | shared i18n; web | FUNC-002, FUNC-003, LOC-001..004 |
| FR-003 | Lens + broad role/industry | Setup schema & session fields (enum-validated) | shared schemas; server | FUNC-004 |
| FR-004 | One core question at a time | Interview UI single-question view; server returns one next prompt | web Interview | FUNC-005 |
| FR-005 | Server enforces 8 core stages | Stage machine Q1..Q8 fixed; progress from core stages only | server `stageMachine` | FUNC-005 |
| FR-006 | ≤1 follow-up/stage; ≤4/session | Follow-up budget counters server-enforced; model may only recommend | server orchestration | FUNC-006, FUNC-007 |
| FR-007 | Skip question | `skip` action → stage stored `unknown`; report shows gap, never invents | server + report renderer | FUNC-008 |
| FR-008 | Edit previous answer | `editAnswer` API on responseId; version increments | server | FUNC-009 |
| FR-009 | Edit invalidates downstream artifacts | `superseded_at` on reports; reflection/preview marked stale; regenerate required | server deletion/supersede | FUNC-009, REPORT-004 |
| FR-010 | Refresh restores session | Token in URL + server state; idempotent get; no duplicate AI call on resume | server; web | FUNC-010, FUNC-011, PERF-003 |
| FR-011 | Block high-severity sensitive input | `sensitiveDataGuard`: client regex + server classification; hard block credentials; warn/redact others | shared guard; server service | SEC-001..003, PERSONA F |
| FR-012 | AI validated against strict schema | zod schemas for call A/B/C; JSON repair ≤1 attempt | shared schemas; server llm | REPORT-001 |
| FR-013 | Facts/assumptions/inference/unknowns distinct | provenance model `extracted_items`, labels through render | shared; report render | AI-008, AI-009, AI-020 |
| FR-014 | Reflection explicit confirm | State `reflection_confirmed` only via confirm endpoint w/ timestamp + method version | server | FUNC-012 |
| FR-015 | Preview before email | Route/state ordering: preview renders before delivery panel; backend rejects email before preview state | server + web | FUNC-013, PRIV-001 |
| FR-016 | Preview content completeness | Preview JSON: thesis, crux, 3 priorities, Stop/Defer, tension | server report preview | FUNC-014 |
| FR-017 | No numeric total score | No score field in schema; readiness = Green/Amber/Red per dimension | shared schema | FUNC-015 |
| FR-018 | Delivery consent separate from newsletter/Pulse/followup | 4 independent consent purposes; separate tables/records | server consent | PRIV-002, PRIV-003, EMAIL-002 |
| FR-019 | Optional boxes unchecked by default | ConsentPanel initial state false; server default false | web + server | PRIV-002 |
| FR-020 | Render 12 sections | Report schema 12 sections + renderer order | shared; web Report | FUNC-016 |
| FR-021 | Provenance labels visible | EvidenceLabel component; label chip per statement | web | FUNC-017, LOC-002 |
| FR-022 | Browser print | Print CSS @media print; hide nav/controls; A4 | web | FUNC-018 |
| FR-023 | Delete via tokenized flow | `/delete/:token`; deletion service; receipt; idempotent | server deletion | PRIV-007 |
| FR-024 | Email: report link, expiry, deletion link | EmailService `sendReport` template | server email | EMAIL-001, PRIV-010 |
| FR-025 | Admin aggregate funnel | admin.metrics: funnel counts, consents, priorities aggregated | server admin | ADMIN-001 |
| FR-026 | Raw answers hidden by default + audited reveal | Admin session view: metadata only; reveal → audit row (actor/time/session/reason) | server admin | ADMIN-002, SEC-008 |
| FR-027 | No raw answers to web analytics | Analytics service allow-list; events table; no free text | server analytics | ADMIN-003, PRIV-008 |
| FR-028 | Pulse tags only w/ consent | pulse_tags created only when consent.pulse granted; controlled vocab | server | PRIV-004, PRIV-005 |
| FR-029 | Suppress small-sample cross-tabs | Threshold (default 20) suppression in admin aggregates | server admin | PRIV-006 |
| FR-030 | Method page: sources, AI role, disclaimer | Public `/method`; content incl. independent-implementation disclaimer | web; shared content | METHOD-001, METHOD-002 |
| FR-032 | Failed AI preserves answers + retry | Error states on server (no advance); UI retry on same state | server + web | FUNC-019, FUNC-020 |
| FR-033 | Idempotent submissions/report | idempotency_key column + unique index; return existing result | server | FUNC-020, FUNC-021 |
| FR-035 | Feedback w/o newsletter consent | feedback.submit endpoint; independent record | server | ADMIN-005 |
| FR-036 | Optional contact request separate | followup purpose separate consent/record | server | ADMIN-005 |
| FR-037 | Keyboard + mobile core flow | 44px targets, focus rings, keyboard order, 375px no-h-scroll | web (all) | A11Y-001, MOBILE-001, VIS-001 |
| FR-039 | Expired/deleted tokens → neutral error | Unified neutral message; no existence oracle | server | FUNC-022 |
| FR-040 | Safe recovery on AI error | User-visible safe action for every AI error | web + server | FUNC-019, EMAIL-003 |

P1 kept: FR-031 (model/prompt/schema version logging — implemented as core audit anyway), FR-034 (resend rate limit — implemented), FR-038 (admin consented export — implemented, P1).

---

## 3. Security & Privacy Requirement Map

| Req | Task | CSV cases |
|---|---|---|
| SEC-01 | All AI/email credentials server-side env only; never in bundle | SEC-011 |
| SEC-02 | ≥128-bit tokens, store hash only | SEC-005 |
| SEC-03 | Rate-limit session create, AI calls, resend, feedback, deletion (in-memory sliding window + DB-safe) | SEC-010 |
| SEC-04 | Input validation (zod), sanitize; render structured JSON only, no raw HTML | SEC-006, SEC-012 |
| SEC-05 | Prompt-injection resistance: system/user boundary, instruction ignore, provenance immutable | SEC-004 |
| SEC-06 | AES-256-GCM encrypt answer content at rest | PRIV-011 |
| SEC-07 | Admin authenticated role-based access (owner token, constant-time) | SEC-007, SEC-009 |
| SEC-08 | Raw-answer reveal → audit event | SEC-008 |
| SEC-09 | Logs exclude answers/emails/report bodies (structured logger with allow-list) | PRIV-009 |
| SEC-10 | Deletion removes linked answers/reports/contact relation per policy | PRIV-007 |
| SEC-11 | CSRF (SameSite+token headers), XSS (escape), SQLi (prepared stmts), broken access control tests | SEC-009, SEC-006 |
| SEC-12 | CI dependency audit + secret scan | CI |

Privacy requirements map 1:1 to CSV `Privacy` area rows PRIV-001..012 (see §5 and test-evidence runbook).

---

## 4. Route & Endpoint Map

### Web routes (SPA client-side; server serves build)
| Route | Page | Auth |
|---|---|---|
| `/` | Landing | public |
| `/start` | Start/setup + privacy mode | public |
| `/session/:token` | Guided interview | token |
| `/session/:token/review` | Reflection & correction | token |
| `/session/:token/preview` | Free preview + delivery choice | token |
| `/report/:token` | Full report viewer & print | token |
| `/method` | Methodology | public |
| `/privacy` | Privacy & retention | public |
| `/delete/:token` | Delete flow | deletion token |
| `/admin` | Admin dashboard | admin session |
| `/admin/session/:id` | Admin session metadata (+audited reveal) | admin |

### API endpoints (Hono, `/api/...`) — contract IDs per PRD §14
| ID | Method/path | Input (zod) | Output |
|---|---|---|---|
| API-01 | POST `/api/session` | language,lens,roleBand,industryBand,alias?,privacyMode | token, state, expiry |
| API-02 | GET `/api/session/:token` | — | safe session state |
| API-03 | POST `/api/session/:token/answer` | stageId,answer,idempotencyKey | assessment,nextState |
| API-04 | POST `/api/session/:token/answer/:responseId/edit` | answer | invalidated flags |
| API-05 | POST `/api/session/:token/reflection` | — | reflection JSON |
| API-06 | POST `/api/session/:token/reflection/confirm` | corrections,confirmation | state → preview ready |
| API-07 | GET `/api/session/:token/preview` | — | preview JSON |
| API-08 | POST `/api/session/:token/delivery` | email,firstName?,consents{delivery,newsletter,pulse,followup} | contact + report state |
| API-09 | GET `/api/report/:token` | — | report JSON |
| API-10 | POST `/api/report/:token/resend` | — | status+cooldown |
| API-11 | POST `/api/report/:token/feedback` | rating,comments?,followupRequested | ok |
| API-12 | POST `/api/privacy/delete` | deletionToken | receipt |
| API-13 | GET `/api/admin/metrics` | admin | aggregate metrics |
| API-14 | GET `/api/admin/contacts` | admin, filters | consented metadata |
| API-15 | POST `/api/admin/sessions/:id/reveal` | admin, reason | audited reveal |
| — | GET `/api/health` | — | ok (no internals) |

Rate limits: session create 20/h/IP, answer+AI 60/h/session, resend 1/10min/report, feedback 10/h/session, deletion 5/h/IP. Idempotency key required on API-03, API-08, API-09-generate.

---

## 5. Database Schema (SQLite, migrations versioned)

```text
sessions        id PK, public_token_hash UNIQUE, language, lens, role_band, industry_band,
                organization_alias NULL, privacy_mode, status, core_stage INT 0..8,
                followup_count INT, method_version, prompt_version, schema_version,
                expires_at, confirmed_at NULL, created_at, updated_at
responses       id PK, session_id FK idx, stage_id (Q1..Q8|FU-*), kind (core|followup|skip),
                answer_ciphertext, answer_nonce, extracted_json NULL (provenance only),
                sensitivity_state, quality_label NULL, version INT, is_active INT,
                created_at, updated_at, superseded_at NULL
followups       id PK, session_id, stage_id, question_text_ciphertext?, asked_at   (count audited)
reports         id PK, session_id FK idx, report_json, version, model_id, prompt_version,
                schema_version, status (generating|ready|superseded|failed), generated_at,
                superseded_at NULL, email_sent_at NULL
contacts        id PK, email_normalized UNIQUE, first_name NULL, verification_state, created_at
consents        id PK, contact_id NULL, session_id, purpose (report_delivery|newsletter|pulse|followup),
                policy_version, granted, granted_at, withdrawn_at NULL
pulse_tags      id PK, report_id FK, session_id FK, tag_key, tag_value     -- controlled vocab only
deletion_log    id PK, session_id, requested_at, receipt_token_hash NULL, reason NULL
audit_log       id PK, actor (admin|user|system), action, session_id NULL, detail_json (allow-list), at
emails          id PK, contact_id NULL, purpose, status (queued|sent|failed|rate_limited),
                subject_hash, body_hash, error_category NULL, created_at, sent_at NULL
analytics_events id PK, name, ts, allowed_props_json       -- NEVER free text
admin_meta      (env-only) ADMIN_TOKEN
feedback        id PK, session_id, report_id NULL, rating, comments_ciphertext?, followup_requested, created_at
```

Encryption: AES-256-GCM (`crypto`), key `ENCRYPTION_KEY` (32B base64) from env; nonce stored per row. Answer plaintext only lives in server memory during processing.

Retention (configurable env, defaults per PRD §13.7): private sessions 24h temp purge; saved sessions 90d; saved report 12mo; email logs 90d; consent ledger per policy; deletion receipts minimal.

---

## 6. LLM Contracts (server-only, strict JSON via zod)

All calls log: model_id, prompt_version, schema_version, latency, status, correlation id. **FakeModelAdapter** in CI returns fixtures incl. invalid JSON, timeouts, injection. Optional `pnpm eval:live` for live-model runs.

**Call A — Assess answer** (schema per PRD 12.2): `acknowledgment`, `answer_quality`, `needs_followup` (must be false ⇒ followup null), `followup_question`, `extracted_items[] {statement,type,source_stage,needs_validation}`, `sensitivity_flags[]`. Server re-checks sensitivity, budget, stage rules; model cannot raise limits.

**Call B — Reflection** (PRD 12.3): decision, facts[], assumptions[], candidate_diagnoses[{diagnosis,support[],counter_evidence[]}], proposed_crux, conflicts[], missing_evidence[]. Requires ≥5 substantive core answers else `insufficient_input`.

**Call C — Preview/Report** (PRD 12.4 + §12.1 report sections): top-level fields incl. schemaVersion, language, 12 sections, readinessSnapshot (5 dims, no total), limitations. Report JSON validated against zod; ≤3 priorities enforced server-side post-validation; Stop/Defer required.

Guardrails enforced in prompt + validator: no invented data; provenance categories immutable; hard-risk list → named human review; injection ignored; no HTML.

---

## 7. Milestone Task Breakdown

### Milestone 1 — Deterministic shell (no AI/email needed)
- [ ] Root workspace, tsconfigs, .env.example, CI stub, gitignore, LICENSE-notes
- [ ] shared: enums, zod schemas (session/answer/reflection/report/consent/feedback), i18n dictionaries EN+zh-CN (all UI copy + labels incl. 用户事实/用户假设/AI 推断/待验证/人工决定)
- [ ] shared: 8-core-question content + quality gates + industry follow-up library + method/privacy content + disclaimers (exact PRD wording)
- [ ] shared: deterministic report fixtures (Personas A–C) used by shell + tests
- [ ] server: DB migrations, session create/get, state machine w/ fixtures mode
- [ ] web: Landing/Start/Interview/Reflection/Preview/Report/Method/Privacy/Delete/Admin pages (fixture data), print CSS, keyboard/mobile, axe clean
- [ ] E2E smoke: landing→start→8 stages(fixture)→reflection→preview→report

### Milestone 2 — State, persistence & privacy
- [ ] State machine full transitions incl. error branches; skip; edit→supersede; expiry
- [ ] Idempotency + rate limiting; token hash store; recovery; retention job
- [ ] Consent ledger (4 purposes, policy version, withdraw); contacts separate
- [ ] Analytics events filtered; sensitive guard (client+server); encryption at rest
- [ ] Admin auth + metrics + suppression thresholds + deletion handling service
- [ ] Integration tests: consent independence, retention, deletion, auth matrix, tokens

### Milestone 3 — AI orchestration
- [ ] LLM adapter + DeepSeek provider + fake adapter + deterministic fallback
- [ ] Orchestration: assess→follow-up budget; reflection gate; preview; report gen; schema repair ≤1
- [ ] Provenance pipeline answer→extracted→report; injection resistance; audit metadata
- [ ] AI contract tests + personas fixtures; sensitive-input & injection tests

### Milestone 4 — Email & reporting
- [ ] EmailService interface: sendReport/sendDeletionReceipt/sendConsentConfirmation; Console + SMTP/Resend adapters
- [ ] Report email: thesis, secure link, expiry, deletion link; no raw answers; resend cooldown idempotent; failure keeps on-screen report

### Milestone 5 — Admin, hardening & QA
- [ ] Admin aggregate metrics, consented export, audited reveal UI
- [ ] Accessibility manual suite, performance pass, security pass
- [ ] Run every CSV case; record evidence in `test-evidence/YYYY-MM-DD-*/`; defect log; release summary
- [ ] `RELEASE_ACCEPTANCE.md`; commit, push, open PR

---

## 8. CSV Release-Blocker Runbook (91 cases → suites)

| Suite | CSV cases | Tool |
|---|---|---|
| E2E P0 (web) | FUNC-001..005,008..011,013..015,022, PRIV-001..003,007, SEC-001..003,006..009, A11Y-001, VIS-001..002, EMAIL-003, ADMIN-002, MOBILE-001 | Playwright + axe |
| Integration | FUNC-006..007,009,012,020..021, PRIV-004..006,008..012, SEC-005,010, REPORT-001, EMAIL-001,004, ADMIN-001,003..005, REPORT-004 | vitest (server) |
| AI fixture/manual | AI-001..020, REPORT-002..003, METHOD-001..002, VIS-003, EMAIL-002 | fixture scripts + rubric reviewer |
| Manual | FUNC-018, A11Y-001(partial),003..006, PERF-001..004, LOC-003 | QA checklist (UAT plan) |
| Security | SEC-004..012 + prompt-injection fixtures | vitest + gitleaks + audit |

Per UAT plan: automated layers unit/component/integration/E2E/contract; personas A–F; ≥3 fixed-run reports per Persona A–E; nine-dimension rubric ≥4.0 mean, no dimension <3.5, traceability ≥95%, 0 fabricated claims, hard risks → named human review, ≤3 priorities, Stop/Defer present. Evidence saved under `test-evidence/`.

---

## 9. Open Owner Decisions (do not block deterministic shell)

1. Final public name (PRD §25.1)
2. Sender domain + email provider (use Console/SMTP env adapter meanwhile; DNS later)
3. Launch jurisdictions + privacy counsel review
4. Final retention periods (env-configurable defaults in place)
5. Anonymous reports after browser close (implement expiry per privacy mode)
6. Admin raw-answer policy (implement audited reveal default-off)
7. Booking destination for Strategy Pressure Test (env config)
8. Final Chinese branding for MingCe Evidence Loop (ship PRD-mandated badge meanwhile)
9. GitHub repo visibility + admin credential management for production

---

## 10. Completion Definition

Per brief: every P0 CSV case Passed or owner-accepted; no S0/S1; typecheck/build/unit/integration/critical E2E green; EN+ZH mobile pass; AI thresholds pass w/ human review; privacy/deletion/injection/cross-session pass; `RELEASE_ACCEPTANCE.md`; commit + push + PR. Deviations recorded in `DECISIONS.md`.
