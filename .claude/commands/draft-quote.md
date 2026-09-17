---
description: Draft a hire quote for a customer enquiry, from the real rate card and real availability, into drafts/. Never sends.
---

The operator names a customer, the gear they asked about, and roughly how long.

1. Ground it in the data first: `npm run hire -- availability <category>` for what can actually go out and at what rates, and `customer <name>` for the relationship (a good account earns sharper pricing; an over-limit one earns none).
2. Compute the money with the real charging rule: per day, week rate capping each run of seven. Quote the day rate, the week rate, and the worked total for the period they asked about. Long-term (a month plus): a weekly figure with the calculation shown.
3. Write the quote to `drafts/quote-<customer>.md`, one page:
   - The gear, by machine or category, with rates.
   - The period, the transport if they need delivery, and the assumptions (site access, who fuels it).
   - The terms that prevent arguments: how charging works, off-hire by phone the day they finish, the return check and how damage is handled, a bond if the operator uses one.
   - Availability honestly: if the machine is committed until Thursday, the quote says from Thursday.
4. Say plainly: it is a draft, a person sends it. When it is accepted, `hire book` turns it into a contract, and `log` records the acceptance.

Never quote gear on the blocked list, and never invent a rate: the rate card is the `assets` table.
