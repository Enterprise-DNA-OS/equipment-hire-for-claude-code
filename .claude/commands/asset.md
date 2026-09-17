---
description: One machine in full, position, clocks, hire history, workshop history, damage history, and whether it earns more than it costs.
---

1. Run `npm run hire -- asset <code>` (codes, partial names and id prefixes all resolve; ambiguity lists candidates).
2. Present the card top-down: where it is now, whether it could lawfully go out (the BLOCKED line), then the histories.
3. The money pair matters: **earned 12 months vs workshop cost 12 months**. A machine underwater on that pair, idle in the yard, is a sell decision waiting for a person. Say so when the numbers say so.
4. Common follow-ups, one command each: `meter <code> <hours>`, `tag <code> --tested=`, `inspection <code> --expires=`, `service book <code>`, and `hire book` when a customer wants it.
