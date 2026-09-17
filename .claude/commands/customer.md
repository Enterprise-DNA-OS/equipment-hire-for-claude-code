---
description: One customer's whole relationship, exposure against the credit limit, live hires, owing, history, notes. Or the list ordered by exposure.
---

1. One customer: `npm run hire -- customer <name>`. The list: `npm run hire -- customers`.
2. Exposure is the number to lead with: **owing plus the unbilled meter**, against the limit. The incumbent shows owing; the meter still running is the half people forget, and it is why a customer can be over their real limit while their statement looks fine.
3. Flags and their moves:
   - **OVER THE LIMIT**: no new bookings without a deliberate decision. `bill` what is accrued, chase what is owed, or raise the limit on purpose.
   - **[STOP]**: `stop`/`unstop <customer>` with the reason logged. Booking refuses stopped accounts.
   - A **consumer** account keeps the CGA whatever the contract says; the system refuses to record an exclusion against one.
4. Every conversation goes on the record: `log <customer|ref> "what was said"`. The notes are what make next month's chase civil.
