---
description: Every machine and its three clocks, where it is, the meter, the service position, the test tag, the inspection, the rates and the idle days.
---

1. Run `npm run hire -- fleet` (filter with `--category=`).
2. The three clocks are the point of the view:
   - **Service** runs on meter hours or months, whichever the machine uses. OVERDUE on a machine that is out is a top-of-attention item.
   - **Tag** is the electrical test tag (AS/NZS 3760). DUE means it does not go out.
   - **Inspection** is the MEWP 6-monthly or crane annual. An expired date is a legal block.
3. `asset <code>` opens one machine: hire history, workshop history, damage history, what it earned and what it cost in 12 months.
4. Movements are one command each: `meter <code> <hours>` when a reading comes in (billing does not depend on it, safety does), `service book`/`done`, `tag`, `inspection`.
5. New machine: `add asset <code> "<description>" --category= --day= --week=` plus `--electrical` or `--inspection=` where the gear needs the clock. A machine added without its clocks is invisible to `/compliance`, so set them at creation.
