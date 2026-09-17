---
description: Everything that wants a decision, worst first. Certificates expired on hire, services overdue, contracts over-running, gear awaiting pickup, money on the meter, dead fleet.
---

1. Run `npm run hire -- attention`.
2. The list is already ordered by how much each item can cost. Read it in that order and do not reorder it by ease:
   - **A certificate expired on gear that is out** (test tag, MEWP inspection) outranks everything. That machine is on a customer's site right now, and if it hurts someone the paperwork says you knew.
   - **A service overdue on hire and a missing pre-hire check** are the same family: HSWA supply duties already breached, fix plus honesty today.
   - **A stopped account with gear still out and a CGA exclusion against a consumer** are decisions someone made wrongly; unmake them.
   - **Contracts running past their expected end** are charging customers who may not mean to pay. Ring before they ring you: that call is the difference between revenue and a dispute.
   - **Awaiting pickup, unbilled finished hires, overdue invoices, drafts never sent** are the company's own money, asleep.
   - **PPSR missing on a long hire** is the machine you lose if that customer folds.
   - **Blocked gear in the yard, long workshop stays and dead fleet** are capital earning nothing.
3. For each item, say the one action: the command to run, the call to make, or the record to fix. Name who owns it.
4. Anything that needs a letter or an email is drafted, never sent: `npm run docs`, or write to `drafts/`.

If the operator asks "what should I do today", pick the top three and say why those three.
