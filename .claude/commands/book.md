---
description: A customer wants gear. Book it, check it, send it out, the whole counter flow, with the gates that keep unsafe gear in the yard.
---

The operator says who wants what, where, from when. Run the flow; the CLI holds the gates.

1. Find the gear: `npm run hire -- availability <category>`. Never offer the blocked list.
2. Book it: `hire book <customer> --site="..." --assets=EX-101,TR-981 --start= [--end=] [--po=] [--by=]`.
   - A stopped account refuses. That refusal is the credit policy working; escalate to the operator, do not `--force` on your own judgment.
   - Gear already committed refuses, with the contract it sits on.
   - New customer first: `add customer "<name>" --type=trade|consumer ...`. The type matters: it decides whether the CGA can ever be excluded.
3. Paper: `npm run docs -- hire-agreement-draft` renders the agreement from the contract's own machines and rates. Signed at the counter, then `contract <ref> --signed=`.
4. Before it leaves: `check <ref> --by=<who>`. This is the pre-hire check record (HSWA s 42, AS/NZS 3760), and `hire start` refuses without it.
5. Out the gate: `hire start <ref>`. If it refuses on a tag, inspection or service, that is the system doing its job: swap the machine or fix the cert. `--force` exists for the operator's own deliberate call and writes itself into the record.
6. Transport if needed: `delivery add <ref> deliver --on= --driver=`.

Say the ref back when done, and what happens next (expected end, first billing).
