---
description: The workshop view, jobs open and due, and every certificate or service clock running down, with what is on hire flagged first.
---

1. Run `npm run hire -- service`.
2. Two tables, one priority rule: **anything overdue on a machine that is ON HIRE comes first.** That is gear on a customer's site with its safety paperwork lapsed, and it is the top of `attention` for the same reason.
3. The moves, one command each:
   - A clock due: `service book <asset> --kind=scheduled|repair|tag-test|inspection --due=`.
   - Work begins: `service start <match>` (the machine shows as workshop while it is in).
   - Work done: `service done <match> --cost= [--meter=] [--expires=]`. Done is what resets the clock: a scheduled service moves the baseline, a tag-test stamps the tag, an inspection stamps the expiry.
   - A reading from the field: `meter <asset> <hours>`. Meters drive the service clocks, so a stale meter hides an overdue service.
4. Long stays: a machine in the workshop past 14 days is on `attention`. The question is always parts, labour, or decision, and the answer goes in the job note.
5. The cost side accumulates on the machine: `asset <code>` shows 12-month workshop cost against 12-month earnings, which is how a repair decision becomes a sell decision.
