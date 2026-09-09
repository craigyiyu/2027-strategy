# Test environment

- Date: 2026-09-09
- Commit: 3d50a0540b0c254ee1bb19b913d8eea1b6f6cc8e
- Server: Node v22.23.2, pnpm 10.33.4
- DB: SQLite (WAL, in-memory for tests; file for smoke)
- LLM mode: deterministic (no-key) for automated runs; live opt-in for AI eval
- Email provider: console
- Browser matrix: Playwright Chromium (E2E); manual Safari/Chrome/Firefox/Edge pending
- Spec: 2027-Strategy-PRD.md v1.0; UAT plan v1.0
