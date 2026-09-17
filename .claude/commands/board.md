---
description: The hire board, every contract that is booked, out, or waiting on a pickup, with the week value and the unbilled meter on each.
---

1. Run `npm run hire -- board`.
2. Read it as the yard manager does:
   - **Live** rows are earning. The `$/week` column totalled is the run rate; `stats` has the total.
   - **Days OVER** on the expected end is the off-hire conversation that has not happened. Those customers are paying past the date they planned to.
   - **[STOP]** beside a customer with a live row is a contradiction: gear out on a held account.
   - **Unbilled** is the meter nobody has drafted. `bill <ref>` per contract, `bill run` for the lot.
   - **Off-hired** rows still on the board are waiting on a pickup or a final bill; `hire close` retires them and refuses if money or damage is unresolved.
3. `hire <ref>` opens any row in full: lines, checks, transport, damage, invoices, notes.

For a printed version in the company's brand, `npm run view -- yard`.
