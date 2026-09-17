---
description: Aged debtors, who owes what, how old it is, drafts that never went out, and the exposure picture behind it.
---

1. Run `npm run hire -- debtors`, and `customers` for the exposure view (owing plus the unbilled meter, against limits).
2. Read the buckets like a credit controller:
   - **Over 60 days** is a phone call from a person, today, and probably a stop conversation: `stop <customer>` holds new bookings while it is sorted.
   - **NOT SENT drafts** are self-inflicted: review and send them, then `invoice sent`.
   - A customer over their limit with gear still on hire is compounding: the meter is adding to a debt they are not paying.
3. Chasing letters are drafted, never sent: `/draft-overdue-letter <customer>` writes one from the record into `drafts/`.
4. Every chase goes on the record: `log <customer> "chased INV-xxxx, promised Friday"`. The trail is what keeps the next conversation short.
