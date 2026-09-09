# Manual QA runbook (UAT plan §9.2, §11, §12)

Run against the live preview. Record results in the dated `test-evidence/` folder.

## A — Keyboard & accessibility (A11Y-001/003/004/005/006)
| Check | Result |
|---|---|
| Full interview keyboard-only: Start → Q1..Q8 → reflection → preview → report | |
| Every interactive control has a visible focus ring | |
| Error states announced by a screen reader and associated with the field | |
| Progress (Q x of 8) has text, not only color | |
| 200% zoom: no lost content, no two-dimensional scroll on report | |
| prefers-reduced-motion disables non-essential animation | |

## B — Mobile (MOBILE-001, VIS-001)
| Check | Result |
|---|---|
| 375×812 anonymous Chinese happy path to report | |
| No horizontal scroll on any core page | |
| Touch targets ≥44×44 | |
| Keyboard never permanently hides the primary action | |

## C — Visual (VIS-001..003 + PRD §18)
| Dimension | Score 1–5 |
|---|---|
| Executive credibility | |
| Visual hierarchy | |
| Readability | |
| Privacy/trust clarity | |
| Brand distinctiveness | |
| Mobile usability | |
| Restraint — no AI clichés | |
Automatic-reject checklist: no AI-brain/robot/casino clichés; no expert portraits/book covers/third-party logos; no email gate before preview; no total strategy score; no tiny/low-contrast text.

## D — Print (FUNC-018)
Open a report → Print/Save as PDF: all 12 sections present, no clipped controls or nav chrome, A4 sensible.

## E — Image-failure resilience (VIS-002)
With network images blocked, Landing / Method / Report remain complete.

## F — Date/time clarity (LOC-003)
EN and zh-CN generated/review dates unambiguous (UTC labelled or local with zone).
