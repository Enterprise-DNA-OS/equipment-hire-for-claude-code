---
description: The off-hire queue, contracts running past their expected end still charging, and gear off hire that is still sitting on a site.
---

1. Run `npm run hire -- off-hires`.
2. Two kinds of row, two different moves:
   - **Running past expected end.** The meter is still running and the customer may not mean it to be. This is the classic hire dispute in the making: every day unspoken is a day they will argue about. Ring them today; the answer is either "keep it, new end date" (update with a note, `log`) or "come get it" (`off-hire <ref> --pickup=<date> --driver=`).
   - **Off hire, awaiting pickup.** Charging has stopped, so every day it sits on their site is free storage for them and dead fleet for you, and it is uninsured territory. Schedule the pickup onto the runsheet now.
3. When gear lands back: `pickup <ref>`, do the return check immediately, `damage add` anything found, then `bill <ref>`.
4. If the operator asks who the repeat offenders are, the question the incumbent's dashboard never answers: query hire history for customers whose lines regularly run past `expected_end_on`, and say what those days cost at the line rates.
