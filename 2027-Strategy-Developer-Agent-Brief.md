# Developer Agent Brief — Build 2027 Strategy

Copy the prompt below into the implementation agent after giving it access to this folder.

---

## Implementation Prompt

You are the lead full-stack engineer, AI product engineer and QA owner for **2027 Strategy**, a privacy-first executive planning web application.

### Required source documents

Read these files completely before writing a plan or code:

1. `2027-Strategy-PRD.md` — authoritative product requirements.
2. `2027-Strategy-Copilot-Methodology.md` — methodology, attribution and intellectual-property boundaries.
3. `2027-Strategy-Visual-Prompts.md` — visual direction and optional generation prompts.
4. `2027-Strategy-UAT-Test-Plan.md` — release strategy and quality thresholds.
5. `2027-Strategy-UAT-Test-Cases.csv` — executable acceptance cases.
6. `2027-strategy-tool-flow.png` — intended user journey.
7. `2027-strategy-methodology-stack.png` — intended method hierarchy.

### Goal

Build a production-quality private-beta MVP that lets an executive:

- Start anonymously.
- Select English or Simplified Chinese, a planning lens, role band and broad industry.
- Complete an eight-question strategy interview with no more than four conditional follow-ups.
- Review and correct a structured “What I heard” reflection.
- See a meaningful strategy preview before entering an email address.
- Generate and view a twelve-section strategy report with visible provenance labels.
- Print/save the report, optionally receive a secure email link and delete saved data.
- Provide feedback or separately request follow-up.

Build a protected admin area for aggregate funnel metrics, consented contact metadata, deletion handling and audited raw-answer reveal.

### Non-negotiable priority order

```text
Privacy and safety
> P0 requirements
> AI schema and server-owned state machine
> UAT acceptance criteria
> visual preferences
```

Do not silently remove or weaken a P0 requirement. If a requirement is infeasible, create `DECISIONS.md` with the requirement ID, reason, impact, risk, temporary behavior and proposed resolution.

### Repository

- Create a private GitHub repository named `2027-strategy` unless it already exists.
- Use short-lived feature branches and open a pull request into the default branch.
- Never commit secrets, real user content, generated credentials or production data.
- Include `.env.example`, setup instructions, migration instructions and test commands.
- Configure CI to run typecheck, unit/integration tests, the critical E2E subset, dependency audit and secret scan.

### Architecture

Use a full-stack TypeScript implementation unless the hosting platform requires an equivalent supported stack:

- React + TypeScript frontend.
- Node/TypeScript backend.
- Typed endpoints or RPC with strict runtime validation.
- Relational database.
- Anonymous high-entropy tokenized sessions; store only token hashes.
- Server-side LLM calls with strict JSON Schema responses.
- Provider-adapter transactional email.
- Authenticated role-protected admin area.
- Versioned prompts, method, report schema and model metadata.

Do not expose API keys to the client. Do not render model-produced HTML. Do not let the model control route/state transitions.

### Delivery sequence

#### Milestone 0 — Requirements map

Before coding:

1. Create `IMPLEMENTATION_PLAN.md`.
2. Map every `P0` functional/security/privacy requirement and every release-blocker CSV case to an implementation task.
3. List chosen stack, key dependencies, database schema, route map, LLM schemas and email provider abstraction.
4. Record open product-owner decisions, but proceed with safe defaults for adjustable choices.

#### Milestone 1 — Deterministic product shell

Build landing, start, interview, reflection, preview, report, method, privacy and admin routes using deterministic fixtures. Implement responsive layout, bilingual UI, accessible controls and browser print.

Checkpoint criteria:

- Main flows render at desktop and 375 px mobile.
- Preview occurs before email capture.
- Eight-stage progress and all report sections are visible.
- Method and privacy pages are complete.
- No real AI or email dependency is required for this checkpoint.

#### Milestone 2 — State, persistence and privacy

Implement the server-owned state machine, idempotency, session recovery, consent ledger, retention fields, token hashing, deletion service, analytics filtering and admin authorization.

Checkpoint criteria:

- Functional and privacy P0 integration tests pass.
- Raw strategy text never reaches standard analytics.
- Optional consents default to false and behave independently.
- Cross-session authorization and deletion tests pass.

#### Milestone 3 — AI orchestration

Implement:

1. Answer assessment and controlled follow-up.
2. Reflection generation.
3. Preview and final report generation.
4. Strict JSON schema validation.
5. At most one schema-repair attempt.
6. Sensitive-input screening before LLM submission.
7. Prompt-injection resistance.
8. Model/prompt/schema audit metadata.

Keep prompts in versioned server files. Add deterministic fake-model adapters so CI does not require live model credits.

Checkpoint criteria:

- Eight core stages and four-follow-up maximum are server-enforced.
- All AI contract tests pass.
- Missing facts remain missing.
- Provenance labels are preserved from generation through rendering.
- Invalid JSON and model timeouts recover without losing answers.

#### Milestone 4 — Email and reporting

Implement the `EmailService` interface and one working provider or sandbox adapter. Transactional delivery must be independent of newsletter permission. Include report, expiry and deletion links without raw answer text.

Checkpoint criteria:

- Email tests pass.
- Provider failure leaves on-screen report usable.
- Resend is rate limited and idempotent.

#### Milestone 5 — Admin, hardening and QA

Complete aggregate metrics, consented contact export, audited raw-answer reveal, accessibility fixes, performance tuning and security checks.

Run every CSV case. Save evidence using the structure in the UAT plan.

### Visual execution

Follow the Visual Prompt Pack. The application must feel like a confidential executive session, not a quiz funnel or generic SaaS dashboard. Use deep navy, warm ivory, evidence green, restrained amber and burgundy risk accents. Use an editorial serif for strategic statements and a neutral sans-serif for UI.

The product must work without images. If generating images, use no more than three in MVP: hero, Strategy Brief still and Open Graph image. Store asset sources and generation prompts in `ASSET_PROVENANCE.md`. Do not use expert portraits, book covers, university logos, identifiable resorts or casino clichés.

### AI quality requirements

The AI must:

- Diagnose before planning.
- Force choices and an explicit Stop / Defer decision.
- Produce no more than three priorities.
- Separate user facts, user assumptions, AI inferences, unknowns and human decisions.
- Never invent market data, financial facts, citations, regulations or benchmarks.
- Mark unsupported material claims `Needs validation`.
- Surface contradictions rather than silently resolving them.
- Require human review for privacy, security, regulatory, capital and other high-impact decisions.
- Produce an owner, test, threshold, review date and Continue / Adjust / Pause / Exit rule for the 90-day evidence gate.

Do not claim that the model was trained on the referenced books. Use the exact independent-implementation disclaimer from the PRD.

### Required automated tests

At minimum implement:

- State-machine and follow-up-limit unit tests.
- Runtime schema validation tests.
- Provenance transformation tests.
- Sensitive-input detection tests.
- Consent independence tests.
- Token entropy/hash tests.
- Authorization and cross-session tests.
- Deletion tests.
- Prompt-injection fixtures.
- Idempotency and duplicate-submit tests.
- Invalid JSON, timeout and email-failure tests.
- Landing, anonymous happy path, saved-report path and admin E2E tests.
- English and Chinese smoke tests.
- axe accessibility checks for core states.

Use fake services in CI. Keep an opt-in command for live-model evaluation; never run it automatically on every commit.

### Required manual/AI evaluation

Use Personas A–F in the UAT plan. Produce at least three fixed-run reports for Personas A–E. Score them with the nine-dimension rubric and store the results under `test-evidence/`. A release fails if it misses any AI threshold in the UAT plan.

### Completion requirements

Do not say the product is complete until:

1. Every P0 CSV case is Passed or has explicit written product-owner acceptance.
2. No S0/S1 defect is open.
3. Typecheck, build, unit, integration and critical E2E tests pass.
4. English and Chinese mobile flows pass.
5. AI quality thresholds pass with human review.
6. Privacy, deletion, prompt-injection and cross-session access tests pass.
7. A final `RELEASE_ACCEPTANCE.md` records the GO/NO-GO decision and evidence.
8. The code is committed, pushed and a pull request is opened.

### Final response format

Report:

- Working preview URL.
- GitHub repository and pull-request URL.
- Architecture summary.
- Implemented P0 count and pass rate.
- Test commands and results.
- AI rubric results.
- Open defects by severity.
- Accepted deviations with PRD IDs.
- Exact remaining product-owner decisions.

Do not provide only a visual prototype or claim success from screenshots. Deliver the tested product and the evidence.

---

## Product Owner Note

Before public release, the owner should decide the sender domain, retention periods, launch jurisdictions, raw-answer admin policy, final MingCe Chinese branding and booking destination. These decisions do not prevent the development agent from building the deterministic shell and private-alpha infrastructure.
