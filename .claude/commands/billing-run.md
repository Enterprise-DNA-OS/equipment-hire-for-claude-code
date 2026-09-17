---
description: The billing run. Draft invoices from the meter for one contract or the whole board. Nothing sends itself.
---

1. See what is accrued first: `npm run hire -- unbilled`. That is every live and finished hire with charge on the meter that no invoice covers.
2. Draft:
   - One contract: `bill <ref>` (a mid-hire progress bill or the final one, same command).
   - The lot, the weekly or monthly run: `bill run`.
   - Each invoice lands as a DRAFT with one line per machine (the days and dates on the line) plus any charged damage. `billed_through` moves with it, so the run never double-charges a day.
3. Review before anything moves: `invoice <number>` per invoice, or `npm run docs -- invoice` to render them branded. Check the drafts read like the conversation the customer remembers having.
4. Send them yourself, from your own email or your accounting system, then `invoice sent <number>`. Money in: `invoice paid <number>`. Aged position: `debtors`.
5. The charging rule, if a customer asks: per calendar day from the day out, the return day free, a same-day return is one day, and every run of seven days caps at the week rate. It is one function in the schema (`hire_charge_cents`), so the answer is the same everywhere.
