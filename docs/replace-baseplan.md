# Moving off Baseplan

Baseplan is an ERP, and ERPs export. The move is one afternoon of report exports and one command, then a single deliberate walk of the yard. This page is the whole path. The same path fits Point of Rental, MCS, inspHire or any hire system whose reports save to CSV.

## 1. Export from Baseplan

From Baseplan's reporting, export three reports to Excel and save each as CSV:

- **Customers**: code, name, contact, email, phone, terms.
- **Fleet / assets**: fleet number, description, category or rate group, make, model, serial, day rate, week rate.
- **Contracts (hire history)**: one row per contract line: contract number, customer, fleet number, site, date out, date in (blank when still on hire), the rates.

Exact report names vary by Baseplan version; anything that produces those columns works, and the importer matches common header spellings (`Fleet No`, `Asset Code`, `Plant No`; `Date Out`, `Start Date`, `On Hire Date`) case-insensitively. NZ and AU `DD/MM/YYYY` dates are read correctly. Export while your subscription is live; do not leave it until the last week.

## 2. Import here

Dry run first, always:

```bash
npm run hire -- import baseplan --customers=customers.csv --assets=fleet.csv --hires=contracts.csv --dry-run
```

Nothing is written. Read the counts and every skip reason; the usual cause of a skip is a contract row whose customer or fleet number does not match the other two files. Then the same command without `--dry-run`.

## 3. What maps

| Baseplan | Here |
|---|---|
| Customers | `customers` (terms carried; codes kept for matching) |
| Fleet / assets | `assets`, with the day and week rates as the rate card |
| Contracts | `hires`, with the old contract number kept in `external_ref` |
| Contract lines | `hire_lines`, rates captured per line as they were |
| Date in blank | the hire lands live, and the board shows it |
| Date in present | the hire lands closed, and the history is queryable forever |

Re-running the import updates rather than duplicates: customers match on name or code, assets on fleet number, contracts on the old contract number.

Imported history arrives marked as already billed (the old system invoiced it); open lines start billing here from the day after the cutover, so nobody is charged twice for the same day.

## 4. What does not carry over, deliberately

- **Certificates and meters.** The old system saying a tag was current is not a tag, and a lapsed MEWP inspection hiding behind a migration is exactly the failure this system exists to prevent. Walk the yard once: `meter`, `tag --tested=`, `inspection --expires=` per machine, from the stickers and certificates actually on the gear. `/compliance` then lists exactly what is still unverified, which is the point. Most yards find at least one surprise on that walk.
- **Open damage and disputes.** Enter what is genuinely open with `damage add`, from the photos and dockets, not from memory.
- **Credit holds and limits.** Set `stop` and `--limit=` deliberately per account; a stop is a decision, not a data row.
- **Invoices and the ledger.** Your accounting system keeps the financial history; this system drafts invoices from cutover forward. Nothing here replaces the accounts.
- **Availability calendars and workflow settings.** The board derives from the lines, so there is nothing to migrate; the weekly rituals are slash commands here, and `/customise` adds yours.

## 5. Verify

```bash
npm run hire -- stats
npm run hire -- fleet
npm run hire -- board
npm run hire -- customers
```

The fleet count, the live contract count and the customer names are the three things to check against the old system. Then run `/attention` and let the list tell you what the migration surfaced.
