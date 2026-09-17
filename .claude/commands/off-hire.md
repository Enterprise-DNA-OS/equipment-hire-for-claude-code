---
description: A customer is finished with gear. Stop the charge, get it back, check it, charge the damage, bill it, close it.
---

The moment a customer says "we're done with it" this flow starts. Every day between that call and the record is a day of argument later.

1. `npm run hire -- off-hire <ref> [asset] [--on=]`. Charging stops the day before the off-hire date (the return day is free; a same-day return charges one day). Part off-hires are normal: name the asset.
2. Schedule the truck in the same breath: `--pickup=<date> --driver=` on the off-hire, or `delivery add <ref> pickup ...` after.
3. When it lands in the yard: `pickup <ref>`. Then the return check, immediately, while the site conversation is warm:
   - Clean: nothing to do.
   - Not clean: `damage add <ref> <asset> "what was found" --cost=` with photos filed wherever the yard keeps them. Then decide, this week: `damage charge` (rides out on the next bill) or `damage waive --reason=`. `attention` nags any report sitting open past 7 days, because damage uncharged for a fortnight is damage you pay for.
4. Bill it: `bill <ref>`. The final invoice picks up the last unbilled days and any charged damage. Render with `npm run docs -- invoice`, send it yourself, `invoice sent`.
5. Close it: `hire close <ref>`. It refuses over unbilled charge, undecided damage or gear not yet back, which is exactly the checklist, enforced.
