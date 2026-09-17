# The rule book /compliance runs

`npm run hire -- compliance` checks the records against the rules below and reports what is breached, with the source cited. The CLI also enforces the sharpest ones at the gate: `hire start` refuses gear with no pre-hire check, an expired test tag, a lapsed inspection or an overdue service, and the system refuses to record a CGA exclusion against a consumer.

**None of this is legal or safety advice.** It is a rule book a New Zealand hire company pointed this system at, written down with sources so it can be checked, argued with, and changed. Your obligations are defined by the Acts, the regulations, the standards you adopt and your own operation; edit this file and the checks together (`/customise` does both).

## The six rules

### 1. safe-plant: no machine on hire with its service overdue

**Source:** Health and Safety at Work Act 2015, s 36 (primary duty) and s 42 (duties of a PCBU that supplies plant: so far as reasonably practicable, the plant is without risks to health and safety), with the General Risk and Workplace Management Regulations 2016 behind it (plant maintained so it stays safe). A hire company is squarely the supplying PCBU.
**The check:** no asset on a live hire line has an overdue service, by meter hours or months, whichever clock the machine runs on.
**The gate:** `hire start` refuses a machine whose service is overdue.
**Fix:** swap the machine or get it serviced now: `service book`, then `service done --meter=`, which resets the clock.

### 2. pre-hire-checks: a recorded check on everything that goes out

**Source:** HSWA 2015 s 42 again, and AS/NZS 3760 (in-service safety inspection and testing), which for hire equipment expects an inspection before each hire. The check is also the moment existing damage gets recorded, which is what makes the return-check conversation fair.
**The check:** every live hire line carries a `pre_hire_check_on` record.
**The gate:** `hire start` refuses lines with no check; `check <ref>` records one.
**Fix:** if a check genuinely happened, backfill it with the honest date. If it did not, do it now, and record now.

### 3. test-and-tag: current tags on all electrical hire gear

**Source:** Electricity (Safety) Regulations 2010 (electrical equipment used in a workplace must be electrically safe); AS/NZS 3760 is the accepted way to show it, and AS/NZS 3012 sets the construction-site expectation, where most hire gear lives: a 3-monthly test cycle. This file defaults every electrical asset to 3 months (`tag_interval_months`); change it per machine if your regime differs.
**The check:** no electrical asset in the hire fleet, on hire or in the yard, has a missing or expired tag.
**The gate:** `hire start` refuses an untagged machine; `availability` lists it as blocked.
**Fix:** test it, then `tag <asset> --tested=`.

### 4. certified-access-plant: current periodic inspections on MEWPs and cranes

**Source:** for MEWPs (scissor lifts, boom lifts), the WorkSafe New Zealand best practice guidance and AS 2550.10: a periodic (6-monthly) inspection by a competent person. For cranes, the Health and Safety in Employment (Pressure Equipment, Cranes, and Passenger Ropeways) Regulations 1999: an annual certificate of inspection.
**The check:** no asset carrying an `inspection_kind` has a missing or expired `inspection_expires_on`, on hire or in the yard.
**The gate:** `hire start` refuses; `availability` lists it as blocked.
**Fix:** book the inspection (`service book <asset> --kind=inspection`), then `inspection <asset> --expires=` from the certificate.

### 5. ppsr: registration on any hire closing in on a year

**Source:** Personal Property Securities Act 1999. Section 16 defines a "lease for a term of more than 1 year" (including indefinite-term leases that run past a year), and the Act treats it as a security interest. Unregistered, your machine can be swallowed by the customer's insolvency: the liquidator's classic win against hire companies.
**The check:** every live hire running 300 days or more carries a `ppsr_registered_on` date. 300, not 365, because the registration needs to exist before the year turns, not after.
**Fix:** register the financing statement at ppsr.govt.nz, then `ppsr <ref> --registered=`. Many hire companies register at day one on open-ended hires; nothing here stops you being early.

### 6. consumer-terms: no contracting out of the CGA against a consumer

**Source:** Consumer Guarantees Act 1993. Hire is a supply of goods under the Act, so hired gear must be of acceptable quality and fit for purpose. Section 43 permits contracting out only where the customer is in trade and the exclusion is in writing and fair; against a consumer the clause is void, and asserting it can breach the Fair Trading Act 1986.
**The check:** no booked, live or off-hired contract has `cga_excluded` set against a customer whose account type is consumer.
**The gate:** `contract --exclude-cga` refuses on a consumer account, with the section cited.
**Fix:** `contract <ref> --include-cga`, and fix the paper terms to match the customer in front of you.

## Australia, at a high level

The same shapes exist under different names; a hire company operating in Australia rebuilds this file on its own state's rules. The parts to read:

- **Plant safety and supply duties:** the model WHS Act (ss 19, 25) and the model WHS Regulations Part 4.5 on plant, as enacted in your state; the "managing risks of plant in the workplace" Code of Practice.
- **Electrical:** AS/NZS 3760 applies on both sides of the Tasman; state electrical safety regulations set the workplace duty, and AS/NZS 3012 the construction-site cycle.
- **MEWPs and cranes:** AS 2550.10 and AS 2550.1; registrable plant classes under the WHS Regulations.
- **PPSR:** the Personal Property Securities Act 2009 (Cth) has the same more-than-a-year lease trap (PPS leases, s 13), and the same fix.
- **Consumers:** the Australian Consumer Law's consumer guarantees, which likewise cannot be excluded against consumers.

`/customise` rewrites the rules and the checks together. Change the words and the SQL in the same commit, so the report never claims a rule the doc does not carry.
