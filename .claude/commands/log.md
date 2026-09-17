---
description: Put a conversation, a site event or a decision on the record, against a contract or a customer. The notes are what the alarms and the arguments both read.
---

1. `npm run hire -- log <ref|customer> "what happened" [--channel=phone|email|yard|site|workshop] [--by=] [--on=]`.
2. A ref logs against the contract (and its customer); a name logs against the customer. Write the note the way it was said, with the facts that will matter later: dates promised, amounts agreed, who said it.
3. Log the moments that turn into disputes when unlogged: the customer extending a hire, the damage conversation at the gate, the payment promise, the reason an account went on stop, any `--force` decision and who made it.
4. Tasks are the other half: `task add "<title>" --customer= --due=` for anything owed to the future, `task done <match>` when it lands. Overdue tasks surface in `attention`.
