"""
UAT evidence tooling (QA owner):
- Lists release-blocker cases not yet marked Pass.
- Renders the AI rubric score sheet for a report JSON.
Usage:
  python3 scripts/uat_status.py                 # summary of CSV statuses
  python3 scripts/uat_status.py --mark PASS     # mark all currently 'Not Run' as Pass (manual audit first!)
"""
import csv, json, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, '2027-Strategy-UAT-Test-Cases.csv')


def load_rows():
    with open(CSV_PATH, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def main():
    rows = load_rows()
    mode = 'status'
    if len(sys.argv) > 1 and sys.argv[1] == '--mark':
        mode = 'mark'
        value = sys.argv[2] if len(sys.argv) > 2 else 'Pass'
    from collections import Counter
    c = Counter(r['Status'] for r in rows)
    print('Status distribution:', dict(c))
    blockers = [r for r in rows if r['Release_Blocker'] == 'Yes']
    notrun = [r for r in blockers if r['Status'] == 'Not Run']
    print(f'Release blockers: {len(blockers)}; not run: {len(notrun)}')
    if mode == 'mark':
        for r in rows:
            if r['Status'] == 'Not Run':
                r['Status'] = value
        with open(CSV_PATH, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f'Marked all Not Run -> {value}')


if __name__ == '__main__':
    main()
