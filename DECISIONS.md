# DECISIONS.md — 2027 Strategy

Records: source-status facts, accepted deviations, environment decisions and open product-owner decisions. Format for deviations: requirement ID, reason, impact, risk, temporary behavior, proposed resolution. Never silently remove a P0.

---

## 0. Source document access (status, 2026-09-09)

- Notion "2027 Strategy — Developer Agent Brief" page: **read** via public notion.site page API (auth-gated anonymous access initially; owner published share link `https://dent-society-886.notion.site/2027-Strategy-Developer-Agent-Brief-3d46a013bcec8190865fd47cf6b1b988?pvs=74`).
- The 7 required source docs were **not present** on bobvps or any reachable host at session start. Owner confirmed they live on the MacBook Air at `/Users/craigyu/Documents/Manus Project/2027 Strategy`. Transferred **11 files** (7 required + 4 bonus) via SSH over Tailscale into this repo root:
  - Required: `2027-Strategy-PRD.md`, `2027-Strategy-Copilot-Methodology.md`, `2027-Strategy-Visual-Prompts.md`, `2027-Strategy-UAT-Test-Plan.md`, `2027-Strategy-UAT-Test-Cases.csv`, `2027-strategy-tool-flow.png`, `2027-strategy-methodology-stack.png`
  - Bonus: `2027-Strategy-Copilot-Blueprint.md`, `2027-Strategy-Developer-Agent-Brief.md`, `2027-strategy-tool-flow.mmd`, `2027-strategy-methodology-stack.mmd`
- All were read in full by the implementation agent except the two `.png` diagrams: the current model cannot ingest images. The equivalent `.mmd` Mermaid sources were read instead, providing the intended journey + method hierarchy content. PNGs remain available to the owner/human reviewers for visual verification (UAT VIS cases).

## 1. Environment decisions (owner approved via questions on 2026-09-09)

| # | Decision | Value |
|---|---|---|
| D-01 | Stack | pnpm monorepo: React+Vite SPA + Node/Hono API + SQLite (privacy-first local) |
| D-02 | AI runtime | DeepSeek API via host `DEEPSEEK_API_KEY` (server-side) + deterministic local fallback so the app works with no key; fake-model adapters in CI |
| D-03 | Delivery | Build + run locally on this host (bobvps), then deploy to bobvps behind nginx at the end |
| D-04 | Git host | `git@github.com:craigyiyu` SSH works; create private repo `2027-strategy` when credentials permit |

## 2. Accepted deviations / interpretations (requirement-tracked)

| ID | Reason | Impact | Risk | Temporary behavior | Proposed resolution |
|---|---|---|---|---|---|
| FR-008/009 (edit UX) | Session safe-state returns stage ids, not response ids, so the dedicated editAnswer route is not reachable from the UI in this build | Users cannot edit a past answer from the review/report views in v1 | Medium | SPA shows an honest explanatory card; re-answering the current stage works; report superseding on server edits is tested | Expose response ids (or an answer-edit capability) in the session payload in the next iteration |

None yet — to be appended during implementation if any P0 cannot be met literally. Intent is zero silent P0 removals.

## 3. Adjustable defaults chosen while owner decisions are pending (safe, reversible)

| Item | Default in effect | Owner decision pending | Config |
|---|---|---|---|
| Public name | `2027 Strategy` (2027 Strategy by Craig on footer opt-in) | PRD §25.1 | copy + env |
| Sender/email | Console/log provider in dev + SMTP adapter (env) — no live sender domain yet | §25.2 | `EMAIL_*` env |
| Jurisdictions | Build generic; privacy copy states product behavior, not legal advice | §25.3 | copy |
| Retention | Private: temp purge 24h; Saved answers 90d; report 12mo; email logs 90d | §25.4 | `RETENTION_*` env |
| Anonymous report after close | Private sessions expire per mode; save mode persists with expiry | §25.5 | session model |
| Admin raw-answer policy | Hidden by default; audited reveal (owner-only token) | §25.6 | `ADMIN_TOKEN` |
| Pressure Test booking | env-configured destination; UI shows generic contact CTA until set | §25.7 | `BOOKING_URL` |
| MingCe Chinese branding | Ship mandated badge 明策证据环｜问题先行 · 选择成链 · 证据过门 · 人类定责 | §25.8 | copy |
| Pulse threshold | 20 opted-in respondents per cross-tab cell | FR-029/PRIV-006 | env `PULSE_MIN_CELL` |
| Model | `deepseek-chat` route default; reflection/report may use `deepseek-reasoner` if env-configured | §12.1 | `LLM_*` env |
