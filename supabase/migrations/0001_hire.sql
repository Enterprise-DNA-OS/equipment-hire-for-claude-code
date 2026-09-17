-- equipment-hire-for-claude-code: core schema.
-- An equipment hire company: the fleet and the certificates each machine must
-- hold (test tags, MEWP inspections, service by the meter), the customers and
-- their credit position, the hire contracts and their lines, the off-hire
-- queue, the runsheet of deliveries and pickups, the workshop, the damage
-- register, and the invoices the billing run drafts.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- Money is in cents. Hire rates are captured onto each contract line the day
-- it is written, so a rate card change never rewrites a running contract.
-- Charging is per calendar day out: the day it leaves the yard is charged, the
-- day it comes back is not, and a same-day return charges one day. A week rate
-- caps every run of seven days, and a part week is charged at day rates up to
-- the week cap. That rule lives in ONE function, hire_charge_cents, and every
-- view and the billing run read it.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- The one charging rule. days is calendar days charged.
create or replace function hire_charge_cents(days integer, day_rate bigint, week_rate bigint)
returns bigint language sql immutable as $fn$
  select case
    when days is null or days <= 0 then 0::bigint
    else (days / 7)::bigint * week_rate + least((days % 7)::bigint * day_rate, week_rate)
  end
$fn$;

-- Staff --------------------------------------------------------------------
-- The people: hire desk, drivers, mechanics, the manager. Drivers appear on
-- the runsheet; mechanics on workshop jobs; whoever wrote the contract is on
-- the hire.

create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  code         text,
  email        text,
  phone        text,
  role         text not null default 'hire desk',   -- manager | hire desk | driver | mechanic
  active       boolean not null default true,
  external_ref text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists staff_name_lower_idx on staff (lower(full_name));

-- Customers ------------------------------------------------------------------
-- Trade accounts and cash customers. account_type drives the Consumer
-- Guarantees Act rule: contracting out of the CGA is only lawful when the
-- customer is in trade (CGA 1993 s 43). on_stop is the credit hold; the CLI
-- refuses new hires to a stopped account.

create table if not exists customers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  code               text,
  account_type       text not null default 'trade',   -- trade | consumer
  contact_name       text,
  email              text,
  phone              text,
  city               text,
  terms_days         integer not null default 20,
  credit_limit_cents bigint,
  on_stop            boolean not null default false,
  status             text not null default 'active',  -- active | former
  note               text,
  external_ref       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists customers_name_lower_idx on customers (lower(name));

-- The fleet --------------------------------------------------------------------
-- One row per machine. status is where the asset lives administratively
-- (in-fleet, workshop, off-fleet); whether it is out on hire is derived from
-- open contract lines, never stored, so the board cannot drift from the truth.
--
-- The three certificate clocks:
--   service: by meter hours (service_interval_hours) or months, whichever the
--            machine uses. HSWA 2015 ss 36 and 42: plant supplied must be safe.
--   tag:     electrical gear carries an in-service test tag (AS/NZS 3760; hire
--            gear is inspected before each hire and tested on a short cycle).
--   inspection: MEWPs carry a 6-monthly periodic inspection (AS 2550.10 via
--            the WorkSafe MEWP guidance); cranes an annual certificate
--            (PECPR Regulations 1999).

create table if not exists assets (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null,
  category               text not null,               -- excavator | scissor-lift | boom-lift | generator | ...
  description            text not null,
  make                   text,
  model                  text,
  serial                 text,
  year                   integer,
  purchased_on           date,
  cost_cents             bigint,
  day_rate_cents         bigint not null default 0,   -- the rate card; captured onto lines at booking
  week_rate_cents        bigint not null default 0,
  status                 text not null default 'in-fleet',  -- in-fleet | workshop | off-fleet
  meter_hours            integer,
  service_interval_hours integer,
  service_interval_months integer,
  last_service_on        date,
  last_service_hours     integer,
  electrical             boolean not null default false,
  tag_tested_on          date,
  tag_interval_months    integer not null default 3,
  inspection_kind        text,                        -- mewp-6-monthly | crane-annual | null
  inspection_expires_on  date,
  note                   text,
  external_ref           text unique,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists assets_code_lower_idx on assets (lower(code));

-- Hire contracts ------------------------------------------------------------------
-- One contract per customer per job. Lines carry the machines. Statuses:
--   booked    written, nothing has left the yard
--   live      at least one line is out
--   off-hired every line is off hire (charging stopped); gear may await pickup
--   closed    billed and done
--   cancelled never went out
--
-- ppsr_registered_on: a hire that runs past a year is a "lease for a term of
-- more than 1 year" under the PPSA 1999 (ss 16, 17) and unregistered the
-- machine can vanish into the customer's insolvency. cga_excluded records that
-- the contract excludes the CGA, lawful only for a customer in trade.

create table if not exists hires (
  id                 uuid primary key default gen_random_uuid(),
  ref                text unique,
  customer_id        uuid not null references customers(id) on delete cascade,
  site               text not null,
  po_number          text,
  status             text not null default 'booked',  -- booked | live | off-hired | closed | cancelled
  start_on           date not null default current_date,
  expected_end_on    date,
  off_hired_on       date,
  closed_on          date,
  taken_by_id        uuid references staff(id) on delete set null,
  contract_signed_on date,
  cga_excluded       boolean not null default false,
  ppsr_registered_on date,
  note               text,
  external_ref       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists hires_customer_idx on hires (customer_id);
create index if not exists hires_status_idx on hires (status);

-- One line per machine on a contract. Rates are captured at booking. The
-- pre-hire check (recorded by `check`) is the HSWA supply-duty gate: `hire
-- start` refuses to send a line out without one. billed_through is the last
-- calendar day already invoiced, so the billing run never double-charges.

create table if not exists hire_lines (
  id                uuid primary key default gen_random_uuid(),
  hire_id           uuid not null references hires(id) on delete cascade,
  asset_id          uuid not null references assets(id) on delete cascade,
  day_rate_cents    bigint not null,
  week_rate_cents   bigint not null,
  on_hired_on       date,
  off_hired_on      date,
  picked_up_on      date,
  pre_hire_check_on date,
  pre_hire_check_by uuid references staff(id) on delete set null,
  billed_through    date,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (hire_id, asset_id)
);
create index if not exists hire_lines_hire_idx on hire_lines (hire_id);
create index if not exists hire_lines_asset_idx on hire_lines (asset_id);

-- Deliveries and pickups: the runsheet ------------------------------------------

create table if not exists deliveries (
  id           uuid primary key default gen_random_uuid(),
  hire_id      uuid not null references hires(id) on delete cascade,
  kind         text not null default 'deliver',   -- deliver | pickup
  scheduled_on date not null,
  driver_id    uuid references staff(id) on delete set null,
  status       text not null default 'scheduled', -- scheduled | done | cancelled
  done_on      date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists deliveries_hire_idx on deliveries (hire_id);
create index if not exists deliveries_date_idx on deliveries (scheduled_on);

-- The workshop --------------------------------------------------------------------
-- Scheduled services, repairs, tag tests and periodic inspections. Finishing a
-- `scheduled` job resets the asset's service clock; finishing a `tag-test` or
-- `inspection` job stamps the certificate. The CLI does that stamping.

create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  kind        text not null default 'scheduled',  -- scheduled | repair | tag-test | inspection
  opened_on   date not null default current_date,
  due_on      date,
  status      text not null default 'due',        -- due | in-workshop | done
  done_on     date,
  cost_cents  bigint,
  mechanic_id uuid references staff(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists services_asset_idx on services (asset_id);
create index if not exists services_status_idx on services (status);

-- Damage ---------------------------------------------------------------------------
-- Found at the return check, recorded against the line it came back from.
-- Charged onto the next invoice, or waived with a reason. Damage that sits
-- uncharged for a week is on the attention list, because two weeks later
-- nobody can argue it.

create table if not exists damage_reports (
  id            uuid primary key default gen_random_uuid(),
  hire_line_id  uuid not null references hire_lines(id) on delete cascade,
  reported_on   date not null default current_date,
  description   text not null,
  est_cost_cents bigint,
  status        text not null default 'open',   -- open | charged | waived
  charged_cents bigint,
  invoice_id    uuid,
  waived_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists damage_line_idx on damage_reports (hire_line_id);

-- Invoices --------------------------------------------------------------------------
-- Drafted by the billing run from the charge accrued on each line plus charged
-- damage. A person sends them; the ERP or accounting system stays where it is.

create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  number       text unique,
  hire_id      uuid not null references hires(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  issued_on    date not null default current_date,
  due_on       date,
  total_cents  bigint not null default 0,
  status       text not null default 'draft',   -- draft | sent | paid
  sent_on      date,
  paid_on      date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists invoices_hire_idx on invoices (hire_id);
create index if not exists invoices_customer_idx on invoices (customer_id);

create table if not exists invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  hire_line_id uuid references hire_lines(id) on delete set null,
  damage_id    uuid references damage_reports(id) on delete set null,
  description  text not null,
  amount_cents bigint not null,
  created_at   timestamptz not null default now()
);
create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- Notes and tasks ----------------------------------------------------------------

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  hire_id     uuid references hires(id) on delete cascade,
  asset_id    uuid references assets(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  noted_on    date not null default current_date,
  channel     text not null default 'phone',   -- phone | email | yard | site | workshop
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists notes_customer_idx on notes (customer_id);
create index if not exists notes_hire_idx on notes (hire_id);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  customer_id uuid references customers(id) on delete cascade,
  hire_id     uuid references hires(id) on delete cascade,
  asset_id    uuid references assets(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  due_on      date,
  status      text not null default 'open',    -- open | done
  done_on     date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at triggers ---------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['staff','customers','assets','hires','hire_lines','deliveries','services','damage_reports','invoices','tasks']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- ==============================================================================
-- Views: the questions a hire company asks every week, as SQL it can read.
-- ==============================================================================

-- Per-line charging: the unbilled window and its value, read everywhere money
-- is discussed. The charge stops the day before off-hire (the return day is
-- free), and a same-day return still charges one day.
create or replace view v_line_charge as
select
  hl.id as line_id,
  hl.hire_id,
  hl.asset_id,
  hl.on_hired_on,
  hl.off_hired_on,
  hl.picked_up_on,
  hl.billed_through,
  hl.day_rate_cents,
  hl.week_rate_cents,
  (hl.on_hired_on is not null and hl.off_hired_on is null) as line_live,
  case when hl.on_hired_on is null then null
       else greatest(hl.on_hired_on, coalesce(hl.off_hired_on - 1, current_date)) end as charge_until,
  case when hl.on_hired_on is null then 0
       else greatest(hl.on_hired_on, coalesce(hl.off_hired_on - 1, current_date)) - hl.on_hired_on + 1 end as total_days,
  case when hl.on_hired_on is null then 0
       else greatest(0,
         greatest(hl.on_hired_on, coalesce(hl.off_hired_on - 1, current_date))
         - greatest(hl.on_hired_on, coalesce(hl.billed_through + 1, hl.on_hired_on)) + 1) end as unbilled_days,
  hire_charge_cents(
    case when hl.on_hired_on is null then 0
         else greatest(0,
           greatest(hl.on_hired_on, coalesce(hl.off_hired_on - 1, current_date))
           - greatest(hl.on_hired_on, coalesce(hl.billed_through + 1, hl.on_hired_on)) + 1) end,
    hl.day_rate_cents, hl.week_rate_cents) as unbilled_cents
from hire_lines hl;

-- The fleet, one row per machine, with every clock a yard manager watches:
-- where it is, what it is earning, and whether it could lawfully go out today.
create or replace view v_fleet as
select
  a.id as asset_id,
  a.code,
  a.category,
  a.description,
  a.status,
  a.day_rate_cents,
  a.week_rate_cents,
  a.meter_hours,
  exists (select 1 from hire_lines hl where hl.asset_id = a.id and hl.on_hired_on is not null and hl.off_hired_on is null) as on_hire,
  (select h.ref from hire_lines hl join hires h on h.id = hl.hire_id
   where hl.asset_id = a.id and hl.on_hired_on is not null and hl.off_hired_on is null limit 1) as hire_ref,
  (select c.name from hire_lines hl join hires h on h.id = hl.hire_id join customers c on c.id = h.customer_id
   where hl.asset_id = a.id and hl.on_hired_on is not null and hl.off_hired_on is null limit 1) as with_customer,
  -- the service clock
  (a.service_interval_hours is not null and a.meter_hours is not null
   and a.meter_hours - coalesce(a.last_service_hours, 0) >= a.service_interval_hours)
  or (a.service_interval_months is not null
      and coalesce(a.last_service_on, a.purchased_on) is not null
      and coalesce(a.last_service_on, a.purchased_on) + (a.service_interval_months || ' months')::interval <= current_date::timestamp)
  as service_overdue,
  case when a.service_interval_hours is not null and a.meter_hours is not null
       then a.meter_hours - coalesce(a.last_service_hours, 0) - a.service_interval_hours end as hours_over_service,
  -- the test tag clock (electrical gear only)
  (a.electrical and (a.tag_tested_on is null
   or a.tag_tested_on + (a.tag_interval_months || ' months')::interval <= current_date::timestamp)) as tag_due,
  a.tag_tested_on,
  -- the periodic inspection clock (MEWPs, cranes)
  (a.inspection_kind is not null and (a.inspection_expires_on is null or a.inspection_expires_on < current_date)) as inspection_expired,
  a.inspection_kind,
  a.inspection_expires_on,
  (select count(*) from services s where s.asset_id = a.id and s.status = 'in-workshop') as jobs_in_workshop,
  -- idle: days since the last off-hire (or purchase, if never hired), when not out
  (select max(hl.off_hired_on) from hire_lines hl where hl.asset_id = a.id) as last_off_hire_on,
  case when exists (select 1 from hire_lines hl where hl.asset_id = a.id and hl.on_hired_on is not null and hl.off_hired_on is null)
       then null
       else current_date - coalesce((select max(hl.off_hired_on) from hire_lines hl where hl.asset_id = a.id), a.purchased_on) end as days_idle,
  coalesce((select sum(il.amount_cents) from invoice_lines il
            join hire_lines hl on hl.id = il.hire_line_id
            join invoices i on i.id = il.invoice_id
            where hl.asset_id = a.id and i.issued_on >= current_date - 365), 0)::bigint as revenue_365_cents,
  coalesce((select sum(s.cost_cents) from services s
            where s.asset_id = a.id and s.status = 'done' and s.done_on >= current_date - 365), 0)::bigint as service_cost_365_cents,
  a.cost_cents,
  a.purchased_on
from assets a
where a.status <> 'off-fleet';

-- The hire board: every contract that is booked, out, or waiting on a pickup.
create or replace view v_hire_board as
select
  h.id as hire_id,
  h.ref,
  c.name as customer,
  c.on_stop,
  h.site,
  h.status,
  h.start_on,
  h.expected_end_on,
  h.off_hired_on,
  case when h.status = 'live' then current_date - h.start_on end as days_on,
  case when h.status = 'live' and h.expected_end_on is not null and h.expected_end_on < current_date
       then current_date - h.expected_end_on end as days_over,
  (select count(*) from hire_lines hl where hl.hire_id = h.id) as lines,
  (select string_agg(a.code, ', ' order by a.code) from hire_lines hl join assets a on a.id = hl.asset_id where hl.hire_id = h.id) as gear,
  coalesce((select sum(hl.week_rate_cents) from hire_lines hl
            where hl.hire_id = h.id and hl.on_hired_on is not null and hl.off_hired_on is null), 0)::bigint as week_value_cents,
  coalesce((select sum(lc.unbilled_cents) from v_line_charge lc where lc.hire_id = h.id), 0)::bigint as unbilled_cents,
  h.contract_signed_on,
  h.ppsr_registered_on,
  h.cga_excluded,
  h.po_number,
  coalesce(s.full_name, '') as taken_by
from hires h
join customers c on c.id = h.customer_id
left join staff s on s.id = h.taken_by_id
where h.status in ('booked', 'live', 'off-hired');

-- What is free right now, and the next booking coming for it.
create or replace view v_availability as
select
  f.category,
  f.code,
  f.description,
  f.day_rate_cents,
  f.week_rate_cents,
  f.status,
  f.service_overdue,
  f.tag_due,
  f.inspection_expired,
  (f.service_overdue or f.tag_due or f.inspection_expired or f.status = 'workshop') as blocked,
  case when f.service_overdue then 'service overdue'
       when f.tag_due then 'test tag expired'
       when f.inspection_expired then 'inspection expired'
       when f.status = 'workshop' then 'in the workshop'
       else '' end as blocked_reason,
  (select min(h.start_on) from hire_lines hl join hires h on h.id = hl.hire_id
   where hl.asset_id = f.asset_id and h.status = 'booked' and h.start_on >= current_date) as next_booked_on
from v_fleet f
where not f.on_hire;

-- The off-hire queue: contracts running past their expected end (the meter is
-- still running and the customer may not know), and gear off hire but still
-- sitting on a site.
create or replace view v_off_hire_queue as
select
  'running past expected end' as reason,
  h.ref, c.name as customer, h.site,
  a.code as asset_code, a.description as asset,
  h.expected_end_on,
  (current_date - h.expected_end_on) as days,
  lc.unbilled_cents,
  hl.id as line_id
from hire_lines hl
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id
join v_line_charge lc on lc.line_id = hl.id
where hl.on_hired_on is not null and hl.off_hired_on is null
  and h.expected_end_on is not null and h.expected_end_on < current_date
union all
select
  'off hire, awaiting pickup',
  h.ref, c.name, h.site,
  a.code, a.description,
  hl.off_hired_on,
  (current_date - hl.off_hired_on),
  0::bigint,
  hl.id
from hire_lines hl
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id
where hl.off_hired_on is not null and hl.picked_up_on is null;

-- Today's runsheet (and anything scheduled that never got done).
create or replace view v_runsheet as
select
  d.id as delivery_id,
  d.kind,
  d.scheduled_on,
  d.status,
  d.done_on,
  h.ref,
  c.name as customer,
  h.site,
  (select string_agg(a.code, ', ' order by a.code) from hire_lines hl join assets a on a.id = hl.asset_id where hl.hire_id = h.id) as gear,
  coalesce(s.full_name, 'unassigned') as driver,
  d.note
from deliveries d
join hires h on h.id = d.hire_id
join customers c on c.id = h.customer_id
left join staff s on s.id = d.driver_id;

-- Utilisation by category: the question the vendor's report menu never quite
-- answers. Fleet on the yard's books, how much of it is earning, what a day of
-- the category is worth, and how much capital sits idle.
create or replace view v_utilisation as
select
  f.category,
  count(*) as fleet,
  count(*) filter (where f.on_hire) as on_hire,
  round(count(*) filter (where f.on_hire) * 100.0 / count(*)) as utilisation_pct,
  count(*) filter (where f.status = 'workshop') as in_workshop,
  count(*) filter (where not f.on_hire and coalesce(f.days_idle, 0) > 90) as idle_90d,
  sum(f.day_rate_cents) filter (where not f.on_hire and f.status = 'in-fleet')::bigint as idle_day_rate_cents,
  coalesce(sum(f.revenue_365_cents), 0)::bigint as revenue_365_cents,
  coalesce(sum(f.service_cost_365_cents), 0)::bigint as service_cost_365_cents,
  coalesce(sum(f.cost_cents), 0)::bigint as capital_cents
from v_fleet f
group by f.category;

-- Open damage, oldest first: every day it sits it gets harder to charge.
create or replace view v_damage as
select
  dr.id as damage_id,
  dr.reported_on,
  (current_date - dr.reported_on) as days_open,
  dr.description,
  dr.est_cost_cents,
  dr.status,
  dr.charged_cents,
  a.code as asset_code,
  a.description as asset,
  h.ref,
  c.name as customer
from damage_reports dr
join hire_lines hl on hl.id = dr.hire_line_id
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id;

-- Aged debtors.
create or replace view v_debtors as
select
  i.id as invoice_id,
  i.number,
  h.ref,
  c.id as customer_id,
  c.name as customer,
  i.issued_on,
  i.due_on,
  i.total_cents,
  i.status,
  i.sent_on,
  (current_date - i.due_on) as days_overdue,
  case
    when i.due_on >= current_date then 'current'
    when current_date - i.due_on <= 30 then '1 to 30'
    when current_date - i.due_on <= 60 then '31 to 60'
    when current_date - i.due_on <= 90 then '61 to 90'
    else 'over 90'
  end as bucket
from invoices i
join hires h on h.id = i.hire_id
join customers c on c.id = i.customer_id
where i.status <> 'paid';

-- One customer, one line: exposure is what they owe plus what the meter has
-- run up that nobody has billed yet, against the credit limit.
create or replace view v_customer_position as
select
  c.id as customer_id,
  c.name as customer,
  c.account_type,
  c.on_stop,
  c.status,
  c.terms_days,
  c.credit_limit_cents,
  (select count(*) from hires h where h.customer_id = c.id and h.status = 'live') as live_hires,
  (select count(*) from hires h where h.customer_id = c.id) as all_hires,
  coalesce((select sum(hb.week_value_cents) from v_hire_board hb
            where hb.customer = c.name and hb.status = 'live'), 0)::bigint as week_value_cents,
  coalesce((select sum(d.total_cents) from v_debtors d where d.customer_id = c.id), 0)::bigint as owing_cents,
  coalesce((select sum(lc.unbilled_cents) from v_line_charge lc
            join hires h on h.id = lc.hire_id where h.customer_id = c.id), 0)::bigint as unbilled_cents,
  coalesce((select sum(d.total_cents) from v_debtors d where d.customer_id = c.id), 0)::bigint
    + coalesce((select sum(lc.unbilled_cents) from v_line_charge lc
                join hires h on h.id = lc.hire_id where h.customer_id = c.id), 0)::bigint as exposure_cents,
  coalesce((select sum(i.total_cents) from invoices i where i.customer_id = c.id and i.status = 'paid'), 0)::bigint as lifetime_paid_cents,
  (select max(n.noted_on) from notes n where n.customer_id = c.id) as last_contact_on
from customers c;

-- Everything that wants a decision, one union, worst first. The top of this
-- list is what WorkSafe would find; the middle is money running on the meter;
-- the bottom is fleet going quietly to waste.
create or replace view v_attention as
-- A machine out on a customer's site with an expired inspection or test tag.
select 'cert_expired_on_hire' as reason, h.ref as label, c.name as customer, a.code as asset,
       case when f.inspection_expired then current_date - a.inspection_expires_on
            else null end as days, null::bigint as amount_cents,
       a.description || ': ' ||
       case when f.inspection_expired then 'periodic inspection expired ' || to_char(a.inspection_expires_on, 'YYYY-MM-DD')
            else 'test tag expired' end || ' and it is ON HIRE' as detail
from hire_lines hl
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id
join v_fleet f on f.asset_id = a.id
where hl.on_hired_on is not null and hl.off_hired_on is null
  and (f.inspection_expired or f.tag_due)
union all
-- A machine on hire with its service overdue.
select 'service_overdue_on_hire', h.ref, c.name, a.code,
       f.hours_over_service, null::bigint,
       a.description || ': service overdue' ||
       coalesce(' by ' || f.hours_over_service || ' meter hours', '') || ' and it is on hire'
from hire_lines hl
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id
join v_fleet f on f.asset_id = a.id
where hl.on_hired_on is not null and hl.off_hired_on is null and f.service_overdue
union all
-- A line that went out with no pre-hire check recorded.
select 'no_pre_hire_check', h.ref, c.name, a.code,
       (current_date - hl.on_hired_on), null::bigint,
       a.description || ': on hire since ' || to_char(hl.on_hired_on, 'YYYY-MM-DD') || ' with no pre-hire check recorded'
from hire_lines hl
join hires h on h.id = hl.hire_id
join customers c on c.id = h.customer_id
join assets a on a.id = hl.asset_id
where hl.on_hired_on is not null and hl.off_hired_on is null and hl.pre_hire_check_on is null
union all
-- A contract running past its expected end: the customer is paying and may not mean to.
select 'off_hire_overdue', q.ref, q.customer, q.asset_code,
       q.days, q.unbilled_cents, q.asset || ': expected off ' || to_char(q.expected_end_on, 'YYYY-MM-DD') || ', still on the meter'
from v_off_hire_queue q where q.reason = 'running past expected end'
union all
-- Gear off hire and still on a site.
select 'pickup_waiting', q.ref, q.customer, q.asset_code,
       q.days, null::bigint, q.asset || ': off hire ' || to_char(q.expected_end_on, 'YYYY-MM-DD') || ', not picked up'
from v_off_hire_queue q where q.reason = 'off hire, awaiting pickup' and q.days >= 2
union all
-- A hire closing in on a year with no PPSR registration.
select 'ppsr_missing', h.ref, c.name, '',
       (current_date - h.start_on), null::bigint,
       'running ' || (current_date - h.start_on) || ' days with no PPSR registration (PPSA 1999: a lease past a year is a security interest)'
from hires h join customers c on c.id = h.customer_id
where h.status = 'live' and h.ppsr_registered_on is null and current_date - h.start_on >= 300
union all
-- A consumer contract that excludes the CGA. That exclusion is void, and writing it is an FTA risk.
select 'cga_excluded_consumer', h.ref, c.name, '',
       null::integer, null::bigint,
       'contract excludes the Consumer Guarantees Act but ' || c.name || ' is a consumer (CGA 1993 s 43)'
from hires h join customers c on c.id = h.customer_id
where h.status in ('booked', 'live', 'off-hired') and h.cga_excluded and c.account_type = 'consumer'
union all
-- A live hire with no signed contract on file.
select 'contract_unsigned', h.ref, c.name, '',
       (current_date - h.start_on), null::bigint,
       'on hire since ' || to_char(h.start_on, 'YYYY-MM-DD') || ' with no signed hire agreement on file'
from hires h join customers c on c.id = h.customer_id
where h.status = 'live' and h.contract_signed_on is null
union all
-- Exposure past the credit limit.
select 'over_credit_limit', c.name, c.name, '',
       null::integer, cp.exposure_cents,
       'owing plus unbilled is past the credit limit of ' || to_char(c.credit_limit_cents / 100.0, 'FM$999,999,990')
from v_customer_position cp join customers c on c.id = cp.customer_id
where c.credit_limit_cents is not null and cp.exposure_cents > c.credit_limit_cents
union all
-- A stopped account with gear still out.
select 'on_stop_live', h.ref, c.name, '',
       null::integer, null::bigint,
       c.name || ' is on stop and still has gear on hire'
from hires h join customers c on c.id = h.customer_id
where h.status = 'live' and c.on_stop
union all
-- Damage sitting uncharged.
select 'damage_open', d.ref, d.customer, d.asset_code,
       d.days_open, d.est_cost_cents,
       d.asset || ': ' || d.description || ' (reported ' || to_char(d.reported_on, 'YYYY-MM-DD') || ', not charged or waived)'
from v_damage d
where d.status = 'open' and d.days_open >= 7
union all
-- A finished hire with money accrued and no bill drafted.
select 'unbilled_finished', hb.ref, hb.customer, '',
       (current_date - hb.off_hired_on), hb.unbilled_cents,
       'off hire ' || to_char(hb.off_hired_on, 'YYYY-MM-DD') || ' with charge accrued and nothing drafted: run bill ' || hb.ref
from v_hire_board hb
where hb.status = 'off-hired' and hb.unbilled_cents > 0
union all
-- An invoice past its due date.
select 'invoice_overdue', d.number, d.customer, '',
       d.days_overdue, d.total_cents,
       'issued ' || to_char(d.issued_on, 'YYYY-MM-DD') || ', due ' || to_char(d.due_on, 'YYYY-MM-DD') || ' (' || d.bucket || ' days)'
from v_debtors d
where d.status = 'sent' and d.due_on < current_date
union all
-- A draft invoice never sent.
select 'invoice_draft', d.number, d.customer, '',
       (current_date - d.issued_on), d.total_cents,
       'drafted ' || to_char(d.issued_on, 'YYYY-MM-DD') || ' and never sent'
from v_debtors d
where d.status = 'draft' and d.issued_on <= current_date - 7
union all
-- A machine in the yard that could not lawfully go out on a hire today.
select 'blocked_in_yard', av.code, '', av.code,
       null::integer, null::bigint,
       av.description || ': ' || av.blocked_reason || ', so it cannot go out on the next call'
from v_availability av
where av.blocked and av.status <> 'workshop'
union all
-- Fleet earning nothing for three months.
select 'dead_fleet', f.code, coalesce(f.with_customer, ''), f.code,
       f.days_idle, f.cost_cents,
       f.description || ': idle ' || f.days_idle || ' days. Sell it, move it, or price it to move.'
from v_fleet f
where not f.on_hire and f.status = 'in-fleet' and coalesce(f.days_idle, 0) > 90
union all
-- A machine stuck in the workshop.
select 'workshop_long', a.code, '', a.code,
       (current_date - s.opened_on), s.cost_cents,
       a.description || ': in the workshop since ' || to_char(s.opened_on, 'YYYY-MM-DD') || ' (' || coalesce(s.note, s.kind) || ')'
from services s join assets a on a.id = s.asset_id
where s.status = 'in-workshop' and s.opened_on <= current_date - 14
union all
-- A task past its date.
select 'task_overdue', t.title, coalesce(c.name, ''), '',
       (current_date - t.due_on), null::bigint,
       'due ' || to_char(t.due_on, 'YYYY-MM-DD')
from tasks t left join customers c on c.id = t.customer_id
where t.status = 'open' and t.due_on < current_date;
