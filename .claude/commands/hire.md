---
description: One contract in full, the gear and rates, the pre-hire checks, transport, damage, invoices and the running meter.
---

1. Run `npm run hire -- hire <ref>` (refs, customer names and sites all resolve).
2. Read the card before answering anything about the contract: the lines carry the truth (out and off dates, checks, the unbilled meter per machine).
3. Watch for the flags the card raises itself:
   - **NOT SIGNED** on a live hire: get the agreement signed; `npm run docs -- hire-agreement-draft` renders one from the contract's own facts.
   - **NO CHECK** on a line that is out: backfill honestly if the check happened, otherwise it is a compliance breach to fix, not hide.
   - **PPSR NOT REGISTERED** appears when the hire closes in on a year (PPSA 1999); `ppsr <ref> --registered=` once it is done on ppsr.govt.nz.
   - **AWAITING PICKUP**: schedule it; off-charge gear on a site is nobody's friend.
4. The lifecycle, each step one command: `hire book` , `check` , `hire start` , `off-hire` , `pickup` , `damage add` , `bill` , `invoice sent|paid` , `hire close`. The card always shows where in that chain the contract stands.
