---
description: Fleet utilisation by category, what share of each category is earning, what sits idle, what a day of idle rates is worth, and what each category earned in 12 months.
---

1. Run `npm run hire -- utilisation`, and `npm run hire -- fleet` if the operator wants machine-level detail behind a number.
2. Read it like an owner, not a dashboard:
   - **High utilisation with bookings queued** is the category to buy more of. Check `availability <category>` for the queue.
   - **Low utilisation** is capital asleep. The `Idle 90d+` machines are listed in `attention` as dead fleet: sell, transfer, or re-price.
   - **Workshop count** against a small category is availability risk: one broken scissor lift in a fleet of three is a third of the category.
   - **Earned 12mo vs Workshop 12mo** per category is the margin conversation. `asset <code>` gives the same pair per machine, which answers "which machines cost more than they earn", the question the vendor report menu never quite has.
3. Utilisation here is a head-count of machines on hire today. If the operator wants time-weighted utilisation over a period, compute it from `hire_lines` date ranges and say the method used.

For the partners' meeting version, `npm run view -- money`.
