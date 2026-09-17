---
description: Run the six-rule compliance book against the records. Safe plant, pre-hire checks, test tags, MEWP and crane inspections, PPSR on long hires, consumer terms. Each rule cites its source.
---

1. Run `npm run hire -- compliance` (or one rule: `compliance test-and-tag`).
2. Present breaches in the book's order, because it is severity order:
   - **safe-plant** and **certified-access-plant** and **test-and-tag** breaches on gear that is ON HIRE are the drop-everything lines. A machine on a site with lapsed safety paperwork is the incident report you have not had yet. The fix is a swap or a workshop visit today, not a diary note.
   - **pre-hire-checks** missing on live lines: backfill only what genuinely happened; otherwise do the check now and record when it was actually done.
   - **ppsr** on a hire closing in on a year: register on ppsr.govt.nz, then `ppsr <ref> --registered=`. This is the rule that saves the machine when a customer folds.
   - **consumer-terms**: fix the record with `contract <ref> --include-cga` and fix the paper contract to match.
3. Every rule's source and reasoning lives in `docs/compliance.md`. Quote the source when explaining a breach; if the operator's question goes beyond what is written there, say so and stop. Nothing here is legal advice.
4. When the operator changes how their business runs (different inspection cycle, an Australian state's rules, a bond regime), `/customise` rewrites `docs/compliance.md` and the checks in `scripts/hire.mjs` together, in the same commit, so the report never claims a rule the doc does not carry.
