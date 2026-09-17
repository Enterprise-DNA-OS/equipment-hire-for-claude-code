---
description: Today's deliveries and pickups by driver, late jobs flagged. The piece of paper the trucks run on, without the paper.
---

1. Run `npm run hire -- runsheet` (or `--date=` for another day).
2. Present it by driver, in a sensible geographic order if the sites make one obvious. LATE rows first: a pickup that did not happen yesterday is gear off charge sitting on a site.
3. Changes are one command each:
   - New job: `delivery add <ref> deliver|pickup --on= --driver=`
   - Done: `delivery done <match>` , then for pickups, `pickup <ref>` to put the gear back in the yard and prompt the return check.
   - A delivery for a booked hire that is going out today usually means `check <ref>` then `hire start <ref>` once it is loaded.
4. If a driver is named and has nothing on, say so; if a job has no driver, flag it before it becomes this afternoon's surprise.
