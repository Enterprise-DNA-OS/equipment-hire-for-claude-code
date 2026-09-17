---
description: The damage register, found at the return check, then charged or waived, in writing, this week.
---

1. Run `npm run hire -- damage` (open reports; `--all` for the history).
2. The discipline is speed: damage charged the week it is found gets paid; damage raised a month later gets argued. `attention` flags anything open past 7 days.
3. The moves:
   - Found at the return check: `damage add <ref> <asset> "what was found" --cost=`. Written in plain words a customer can read back, because they will.
   - Charging it: `damage charge <match> [--amount=]`. It rides out on the next `bill <ref>` as its own line.
   - Letting it go: `damage waive <match> --reason=`. Fair wear and tear is a real category; the reason is the record.
4. A consumer customer's damage conversation lives under the CGA; charge for damage, not for the machine's own wear or faults. When in doubt about which side of that line something falls, present the facts to the operator and let them decide.
5. Patterns are worth surfacing unprompted: the same customer, the same machine, or the same site producing repeat reports is a conversation, not a coincidence.
