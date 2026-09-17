---
description: The Monday review, written from three commands. The board, the compliance position, the money, and the five things that matter this week.
---

Run these three, in this order, and write the review from what they return. Do not write anything they do not support.

```
npm run hire -- attention
npm run hire -- utilisation
npm run hire -- debtors
```

Then write it in this shape, no more than a page:

1. **The week in one line.** Machines on hire out of fleet, the weekly run rate, the unbilled meter, what is owed, and the attention count (`stats` has all five).
2. **Safety first, always.** Any certificate expired or service overdue on gear that is out, and any pre-hire check missing. These lines lead the review because they are the ones WorkSafe would read.
3. **The off-hire queue.** Contracts over-running (with what the silence is costing) and gear awaiting pickup. Each with the call to make.
4. **The money.** The unbilled meter by contract, invoices past 30 days, drafts never sent, anyone over their limit. One line each with the move.
5. **The fleet.** Utilisation by category, what is stuck in the workshop and for how long, and the dead fleet with its capital number. Buy, fix, or sell, per line.
6. **The paper.** Unsigned live contracts, the PPSR position on long hires, anything the compliance book flags (`compliance` for the full run).
7. **The five things to do this week.** Picked from the attention list, weighted by what breaches first and what it costs, with why each made the list.
8. **One thing to decide.** The single item that needs a person, not a process.

Add `npm run view -- yard` and `npm run view -- money` if the operator wants pages to take to a meeting. They render the same numbers in the company's brand, and they print.

Numbers come from the commands. If a number is not in the output, it does not go in the review.
