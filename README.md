<h1 align="center">Equipment Hire for Claude Code</h1>

<p align="center">
  <strong>The open-source equipment hire system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Or installed and run for you.
</p>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-baseplan-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-baseplan">Instead of Baseplan</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Equipment Hire for Claude Code does the job you pay Baseplan for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and ask for what you want in plain language. It runs the right query, and it can answer questions the vendor's report menu cannot.

It is built for a hire company: the fleet with the three certificate clocks every machine carries (service by the meter, the electrical test tag, the periodic inspection on access gear), the customers and their real exposure (owing plus the meter still running), the contracts and their lines, the off-hire queue that becomes disputes when nobody rings, the runsheet the trucks run on, the workshop, the damage register, and the billing run that drafts invoices from the meter. The words are the words a hire desk already uses.

**Nothing sends, pays or talks to an ERP on its own.** Invoices are drafted here and a person sends them; your accounting system keeps the ledger. The gates are real, though: gear with lapsed safety paperwork does not go out, and a contract does not close over unbilled charge or undecided damage.

```
/attention                        everything that wants a decision, worst first
/availability scissor             what can go out right now, and what is blocked, and why
/board                            every contract: the week value and the meter on each
/off-hires                        over-running contracts still charging, gear awaiting pickup
/runsheet                         today's deliveries and pickups by driver
/utilisation                      what share of each category is earning, and the dead fleet
/service-due                      the workshop queue and every certificate clock running down
/book                             customer wants gear: book, check, out the gate, with the gates
/off-hire                         customer is done: stop the charge, return check, damage, bill
/billing-run                      draft the invoices from the meter; a person sends them
/compliance                       six rules from the Acts and the standards, run against your records
/weekly-review                    the Monday review, written from three commands
```

Charging is one rule in one SQL function: per calendar day from the day the gear leaves, the return day free, a same-day return charges one day, and every run of seven days caps at the week rate. Rates are captured onto each contract line the day it is written, so a rate card change never rewrites a running contract.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export request, no API project, no access ending when a subscription does.
- No per-user licence, no implementation project, no module tiers. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/equipment-hire-for-claude-code.git
cd equipment-hire-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Kaimai Hire (a demo Tauranga hire company with 20 machines and 13 contracts: a scissor lift on hire with its MEWP inspection 18 days expired, a generator out with a lapsed test tag, a roller 60 meter hours past its service, a subdivision contract 9 days past its expected end and still charging, a site office on hire 340 days with no PPSR registration, a forklift off hire for 8 days with an $850 damage report nobody has charged, and $10,445 sitting on the meter), then prints the board, the off-hire queue, the attention list and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/availability`, `/board`, `/off-hires`, `/utilisation`, `/service-due`, `hire HC-1003`. When you are ready for real data, delete `.data/` and start with `/import`, or add records one at a time with `add customer`, `add asset`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md) so drafts come out in your company's voice, and put your name and colours in [brand.json](brand.json) so the invoices, agreements and dockets carry them.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. The hire desk, the workshop and the owner each clone the repo, point at the same `DATABASE_URL`, and work in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: certs expired on hire, over-running contracts, money asleep. |
| `/availability` | The phone-call answer: what can go out now, what is blocked and why. Never offers blocked gear. |
| `/board` | Every open contract with its gear, week value, days over and unbilled meter. |
| `/hire` | One contract in full: lines, checks, transport, damage, invoices, notes. |
| `/book` | The counter flow: book, agreement, pre-hire check, out the gate. The CLI refuses unsafe or committed gear. |
| `/off-hire` | The finish flow: stop the charge, pickup, return check, damage, final bill, close. |
| `/off-hires` | The queue: running past expected end (still charging) and off hire awaiting pickup. |
| `/runsheet` | Today's deliveries and pickups by driver, late jobs first. |
| `/fleet` / `/asset` | Every machine and its three clocks; one machine with its whole history and its earn-vs-cost pair. |
| `/utilisation` | Earning share by category, idle capital, what each category earned and cost in 12 months. |
| `/service-due` | The workshop queue and every certificate clock, on-hire breaches first. |
| `/damage` | The register: found at the return check, charged or waived in writing, this week. |
| `/billing-run` | Draft invoices from the meter, one contract or the lot. Never double-charges a day. |
| `/debtors` | Aged debtors, drafts never sent, and exposure (owing plus meter) against limits. |
| `/customer` | One account's whole relationship, or the list ordered by exposure. |
| `/compliance` | Six rules from the Acts and the standards, run against your records, each with its source. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/log` | Conversations, site events and decisions onto the record. The alarms and the arguments both read it. |
| `/import` | Bring the business across from Baseplan or any hire system that exports CSV. |
| `/draft-quote` | A hire quote from the real rate card and real availability, into `drafts/`. |
| `/draft-overdue-letter` | The chasing letter, from the record, into `drafts/`. |
| `/customise` | Add a field, rename categories, change a rule, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run hire -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # tax invoices, hire agreement drafts, off-hire dockets, workshop job cards, as HTML
npm run view    # the yard and the money, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your company's name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached. Each rule cites its source, and the CLI enforces the sharpest ones at the gate: `hire start` refuses a machine with no pre-hire check, an expired test tag, a lapsed inspection or an overdue service, and a CGA exclusion cannot be recorded against a consumer.

1. No machine on hire with its service overdue (HSWA 2015 ss 36 and 42; GRWM Regulations 2016).
2. A recorded pre-hire check on everything that goes out (HSWA s 42; AS/NZS 3760).
3. Current test tags on all electrical hire gear (Electricity (Safety) Regulations 2010; AS/NZS 3760; AS/NZS 3012's 3-monthly construction cycle).
4. Current periodic inspections on MEWPs and cranes (WorkSafe MEWP guidance and AS 2550.10; PECPR Regulations 1999).
5. PPSR registration on any hire closing in on a year (PPSA 1999 ss 16 and 17: the machine you lose in the customer's insolvency if you skip this).
6. No contracting out of the CGA against a consumer (CGA 1993 s 43).

The Australian equivalents (model WHS plant duties, PPS leases under the 2009 Act, the Australian Consumer Law) are in the same file, at a high level, with the parts to read. Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your operation.

## Ten questions Baseplan cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. What is on a customer's site right now with an expired test tag or a lapsed MEWP inspection, and how many days has it been out like that?
2. Which machines earned less in the last 12 months than the workshop spent on them?
3. Which contracts are running past their expected end, and what is the silence worth per week at the line rates?
4. Which customers habitually keep gear past the end date, and what did those days add up to this year?
5. What is each customer's real exposure: invoices owing plus the meter still running, against their limit?
6. Which machines could not lawfully go out if the phone rang right now, and what would unblock each one?
7. Which hires are closing in on a year with no PPSR registration, and what capital is at risk if that customer folds?
8. What did damage cost this quarter: charged, waived, and still sitting open past a week?
9. Which machines have sat idle 90 days or more, what capital do they tie up, and what did they earn all year?
10. What share of each category is earning today, and which category turns bookings away while another gathers moss?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your yard.

1. "Load our fleet list with our codes, our day and week rates, and which machines are electrical or MEWPs."
2. "Put our logo and colours on the invoices and dockets, and change the company name to ours."
3. "Our categories are Access, Earthmoving, Power, Site Accom. Rename them everywhere."
4. "We test tags monthly, not quarterly. Change the cycle on every electrical machine."
5. "Add a transport charge per delivery, with a rate per zone, and put it on the invoices."
6. "Add a rule to `/compliance`: no machine over 10 years old goes out without an engineer's report on file."
7. "We charge a 5-or-7-day week depending on the customer. Add a per-customer charging basis."
8. "We are in Queensland. Rebuild the compliance file on the WHS Regulations and the ACL."
9. "Build me a page per driver for the morning: their runs, gate codes, and what needs a check."
10. "Write me a command that drafts the recall letter when a machine goes out on safety recall, for every customer who has hired it."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of Baseplan

Export your customer, fleet and contract reports as CSV, run one command, and the business comes with you. Step by step, with what maps and what deliberately does not: [docs/replace-baseplan.md](docs/replace-baseplan.md).

```bash
npm run hire -- import baseplan --customers=customers.csv --assets=fleet.csv --hires=contracts.csv --dry-run
npm run hire -- import baseplan --customers=customers.csv --assets=fleet.csv --hires=contracts.csv
```

Point of Rental, MCS, inspHire and any other hire system that exports CSV go through the same command with `csv`.

Certificates, meters and open damage deliberately do not import: the old system saying a tag was current is not a tag. You walk the yard once with the stickers in front of you, and `/compliance` lists exactly what is still unverified. Most yards find at least one surprise on that walk, which is the argument for the walk.

## Architecture

```
equipment-hire-for-claude-code/
  CLAUDE.md                              how the company wants this run (routing table + house rules)
  brand.json                             your name, logo and colours on every document and view
  views.json                             the HTML dashboards npm run view renders
  documents.json                         the paperwork npm run docs renders
  .claude/commands/                      the slash commands
  scripts/hire.mjs                       the CLI the commands drive
  scripts/view.mjs                       read-only HTML dashboards from the SQL views
  scripts/docs.mjs                       the documents, one HTML file per record
  scripts/lib/db.mjs                     one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/                   plain SQL schema, tables and views
  supabase/seed.sql                      demo data (Kaimai Hire)
  docs/compliance.md                     the rules /compliance checks, each with its source
  docs/replace-baseplan.md               moving off the incumbent
  docs/why-no-front-end.md               the honest trade-offs
  exports/                               whole database dumps
  drafts/                                quotes and letters written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, nothing that sends, and the safety gates stay gates.

## Want it installed and run for you?

Enterprise DNA installs Equipment Hire for Claude Code for your company, migrates your Baseplan data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call
- Read more: https://enterprisedna.co/omni/instead-of/baseplan

## License

MIT. Copyright (c) 2026 Enterprise DNA.
