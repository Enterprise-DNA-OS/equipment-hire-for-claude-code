---
description: The phone-call question, what can go out right now, with what is in the yard but blocked and why. Optionally for one category.
---

The operator is usually on the phone with a customer. Speed and honesty, in that order.

1. Run `npm run hire -- availability` (or `availability <category>` when they name the kind of machine: excavator, scissor, generator).
2. Answer the question first: what is free, at what day and week rate, and any booking already coming for it. If the exact machine is committed, say what the nearest substitute is.
3. The blocked list is not available, and never gets promised: an expired tag, a lapsed inspection or an overdue service is a legal block, not a scheduling one (`/compliance` has the sources). Say what would unblock each one, because sometimes the fix is an hour in the workshop.
4. If the customer wants it held, book it on the spot: `hire book <customer> --site= --assets= --start=` holds the gear (booking refuses gear already committed). Then `/book` runs the rest of the flow.

Never offer a machine on the blocked list, even for "just a day". That is exactly the day it hurts someone.
