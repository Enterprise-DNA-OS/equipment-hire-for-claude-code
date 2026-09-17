# Equipment Hire for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Company:** [YOUR COMPANY], an equipment hire company in [city, country]
- **Operator:** [YOUR NAME], [owner / hire desk manager / operations manager]
- **The fleet:** [what you hire and roughly how much of it: access, earthmoving, power, site accommodation, small plant]
- **The team:** [the hire desk, the drivers, the workshop, who authorises credits and stops]
- **The rates:** [where the rate card lives: the `assets` table is it. Note any per-customer deals.]
- **Charging basis:** [the default is a 7-day calendar week with a week-rate cap; note here if some customers run 5-day weeks]
- **Where the accounts live:** [your accounting system. Invoices are drafted here, sent and reconciled there.]
- **What matters most:** [for example: nothing goes out unchecked or untagged, off-hires rung back same day, damage charged within the week, no account over its limit without a decision]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything for a customer, run `hire <ref>` and read the whole card: the lines, the notes, the money. Before touching an account, run `customer <name>` and read the history.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The trade's words, not software words: gear, the round, on hire, off hire, the meter, the runsheet, a docket, the yard, on stop.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.
6. **Never invent a fact.** Codes, dates, rates and amounts come from the operator or the database. If a fact is missing, say which one.
7. **Never state a legal or safety position you have not checked.** The plant, tag, inspection, PPSR and consumer rules are in `docs/compliance.md` with their sources. Quote the source. If the question is outside what is written there, say so and stop. Nothing here is legal advice.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing today | `/attention` |
| Can a customer have X, what is free | `/availability` |
| What is out, what are we earning | `/board`, `stats` |
| A customer wants gear | `/book` (book, agreement, check, start) |
| It is leaving the yard | `check <ref>`, then `hire start <ref>` |
| They are finished with it | `/off-hire` (off-hire, pickup, check, damage, bill, close) |
| What is over-running or awaiting pickup | `/off-hires` |
| What are the trucks doing | `/runsheet`; changes via `delivery add` / `delivery done` |
| A machine's story, the fleet's clocks | `/asset`, `/fleet` |
| What is due in the workshop | `/service-due`; work via `service book` / `start` / `done` |
| A meter reading came in | `meter <asset> <hours>` |
| A tag or inspection was done | `tag <asset> --tested=`, `inspection <asset> --expires=` |
| The return check found damage | `damage add`, then `damage charge` or `damage waive` |
| Bill the week, bill a contract | `/billing-run`, `bill <ref>`, `bill run` |
| An invoice went out, got paid | `invoice sent`, `invoice paid` |
| Who owes us money | `/debtors`; the whole exposure picture is `customers` |
| Everything about one account | `/customer` |
| Hold an account, release it | `stop <customer>`, `unstop <customer>` |
| A quote, a chasing letter | `/draft-quote`, `/draft-overdue-letter` |
| I spoke to them, note it down | `/log` |
| The Monday review | `/weekly-review` |
| Would this pass an audit | `/compliance` |
| Bring the business over from Baseplan | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |
| The paperwork, in our brand | `npm run docs` |

If an ask fits nothing here, run the CLI directly (`npm run hire -- help`) and then propose a new command for it.

## Hard rules

- **Blocked gear does not go out. Ever.** An expired test tag, a lapsed inspection or an overdue service is a legal block, not a scheduling preference (HSWA 2015 ss 36 and 42). `hire start` refuses; `--force` is the operator's own deliberate call, made by them in this session, and the override writes itself into the record.
- **No pre-hire check, no hire.** `check <ref>` before `hire start`. Backfill only checks that genuinely happened, with their honest dates.
- Never send email, invoices or letters from here. Draft to `drafts/`, render with `npm run docs`, a person sends. That includes every quote, agreement, invoice and chasing letter.
- Never book gear onto a stopped account on your own judgment. The refusal is the credit policy working; escalate to the operator.
- Never record a CGA exclusion against a consumer. The CLI refuses, and the refusal is correct (CGA 1993 s 43).
- Never let an off-hire go unrecorded. The moment a customer says they are done, `off-hire <ref>`: charging and the record both depend on that date.
- Never charge damage that was not recorded at the return check, and never sit on a report: charged or waived, in writing, inside the week.
- Never invent or adjust charges by editing rows. The charging rule is one function; a discount is a note and a decision by the operator on the invoice before it is sent.
- Never delete records without an explicit yes in this session. A customer who leaves goes `former`; a machine that is sold goes `off-fleet`. History is the asset.
- Meters do not run backwards, and a stale meter hides an overdue service. Enter readings as they come in.
- The database is the source of truth. If the answer is not in it, say so.

## Words this yard uses

- **Gear goes on hire and comes off hire.** The **off-hire call** is the customer saying they are done; charging stops then, not when the truck arrives. Gear off hire but not collected is **awaiting pickup**, and it is nobody's friend.
- A **contract** (`HC-…`) is one customer, one site, one or more machines, each a **line** carrying its own captured rates and dates.
- The **meter** is both the machine's hour clock and the money accruing on a line. Context says which; the system tracks both.
- The **runsheet** is the day's deliveries and pickups. A docket records a movement or a return check.
- The **three clocks** on a machine: the service (hours or months), the test tag (electrical gear, AS/NZS 3760), the periodic inspection (MEWPs 6-monthly, cranes annual). Any clock expired means **blocked**.
- **On stop** is a credit hold. **Exposure** is invoices owing plus the meter still running, and it is the number that matters, not the statement balance.
- The **PPSR** is where a hire running past a year gets registered (PPSA 1999), and skipping it is how a hire company donates a machine to a liquidator.
- **Dead fleet** is a machine idle 90 days: capital asleep in the yard.

## Where things live

- `scripts/hire.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-baseplan.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/baseplan
