---
description: Draft the overdue-account letter for one customer, from the record, into drafts/. Firm, accurate, and never sent from here.
---

The operator names a customer whose account needs chasing. `debtors` is usually why.

1. Read the record first: `npm run hire -- customer <name>`. The letter is written from what is true: which invoices, issued when, due when, chased when (the notes hold the chase history), and what gear of theirs is still out.
2. Write it to `drafts/overdue-<customer>.md`:
   - The invoices by number, date and amount, and the total. Numbers from the database only.
   - What has already been said, briefly: "when we spoke on the 11th, payment was promised by Friday" reads very differently from a form letter, and the notes make it possible.
   - The ask: a date, an amount, a person to call.
   - The consequence, stated once and civilly: new hire on the account holds until it is settled (`stop <customer>` when the operator decides that), and gear on hire may be recalled.
   - A consumer debtor is handled gently and by the book; no threats the operator would not carry out.
3. Say plainly: it is a draft, a person sends it, and the send goes on the record: `log <customer> "sent overdue letter for INV-xxxx" --channel=email`.
4. Offer the follow-up task in the same breath: `task add "Call <customer> if unpaid" --customer= --due=`.
