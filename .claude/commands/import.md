---
description: Bring the business across from Baseplan or any hire system that exports CSV. Customers, fleet, contracts and their history, in one command, dry-run first.
---

The full path with what maps and what deliberately does not: `docs/replace-baseplan.md`. The short version:

1. Get the exports: a customer list, a fleet/asset list, and a contract (hire) report with one row per contract line, as CSV. Baseplan's reports export to Excel; save as CSV. Column names are matched forgivingly (`Fleet No`/`Asset Code`/`Plant No` all work; NZ/AU `DD/MM/YYYY` dates are read correctly).
2. Dry run, always: `npm run hire -- import baseplan --customers=customers.csv --assets=fleet.csv --hires=contracts.csv --dry-run`. Nothing is written. Read the counts and every skip reason; the usual cause is a contract row whose customer or fleet number does not match the other files.
3. Run it without `--dry-run`. Re-running updates rather than duplicates (customers match on name or code, assets on fleet number, contracts on the old contract number).
4. Then the pass that matters more than the import: **certificates, meters and open damage do not import, deliberately.** The old system saying a tag was current is not a tag. Walk the yard once: `meter`, `tag`, `inspection`, `service` per machine, `damage add` for anything open. `/compliance` then lists exactly what is still unverified, which is the point.
5. Verify: `stats`, `fleet`, `board`, `customers` against the old system's counts, then `attention` to see what the migration surfaced.
