#!/usr/bin/env node
// equipment-hire-for-claude-code: the one CLI. Claude Code slash commands call
// this; so can you.
//
//   node scripts/hire.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system records what an equipment hire company runs on every week: the
// fleet and the three certificate clocks each machine carries (service by the
// meter, the electrical test tag, the periodic inspection on access gear), the
// customers and their credit position, the hire contracts and their lines, the
// off-hire queue, the runsheet, the workshop, the damage register and the
// billing run. It sends nothing, pays nothing and talks to no ERP on its own:
// invoices are drafted here and a person sends them.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, isoDate, short, truncate, heading, bar } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set([
  'json', 'help', 'all', 'dry-run', 'force', 'include-cga', 'exclude-cga', 'blocked',
]);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates and money

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000);
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australian exports write DD/MM/YYYY, so the first number
  // is the day unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not an amount.`);
  return Math.round(n * 100);
}

// The one charging rule, mirrored from hire_charge_cents in the schema:
// day rate per calendar day, the week rate caps every run of seven.
function chargeCents(days, dayRate, weekRate) {
  if (!days || days <= 0) return 0;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return weeks * weekRate + Math.min(rem * dayRate, weekRate);
}

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact code or ref or name,
// then contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  customer: {
    from: 'customers c',
    cols: 'c.*',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.code, '')) = lower($1) or lower(coalesce(c.email, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.contact_name ilike $1',
    label: (r) => `${r.name} (${r.account_type}${r.on_stop ? ', ON STOP' : ''})`,
    order: 'c.name',
    listing: 'customers',
  },
  staff: {
    from: 'staff c',
    cols: 'c.*',
    exact: "lower(c.full_name) = lower($1) or lower(coalesce(c.code, '')) = lower($1)",
    fuzzy: 'c.full_name ilike $1',
    label: (r) => `${r.full_name} (${r.role})`,
    order: 'c.full_name',
    listing: 'staff',
  },
  asset: {
    from: 'assets c',
    cols: 'c.*',
    exact: "lower(c.code) = lower($1) or lower(coalesce(c.serial, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.code ilike $1 or c.description ilike $1 or c.category ilike $1',
    label: (r) => `${r.code}  ${r.description} (${r.status})`,
    order: 'c.code',
    listing: 'fleet',
  },
  hire: {
    from: 'hires c join customers cu on cu.id = c.customer_id',
    cols: 'c.*, cu.name as customer_name, cu.account_type, cu.on_stop, cu.terms_days',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or cu.name ilike $1 or c.site ilike $1',
    label: (r) => `${r.ref}  ${r.customer_name}: ${truncate(r.site, 38)} (${r.status})`,
    order: 'c.start_on desc',
    listing: 'board',
  },
  invoice: {
    from: 'invoices c join customers cu on cu.id = c.customer_id join hires h on h.id = c.hire_id',
    cols: 'c.*, cu.name as customer_name, h.ref as hire_ref',
    exact: "lower(coalesce(c.number, '')) = lower($1)",
    fuzzy: 'c.number ilike $1 or cu.name ilike $1 or h.ref ilike $1',
    label: (r) => `${r.number}  ${r.customer_name} ${money(r.total_cents)} (${r.status})`,
    order: 'c.issued_on desc',
    listing: 'invoices --all',
  },
  service: {
    from: 'services c join assets a on a.id = c.asset_id',
    cols: 'c.*, a.code as asset_code, a.description as asset_description',
    exact: 'false',
    fuzzy: "a.code ilike $1 or coalesce(c.note, '') ilike $1 or c.kind ilike $1",
    label: (r) => `${short(r.id)}  ${r.asset_code} ${r.kind} (${r.status})${r.note ? ': ' + truncate(r.note, 36) : ''}`,
    order: 'c.opened_on desc',
    listing: 'service',
  },
  damage: {
    from: 'damage_reports c join hire_lines hl on hl.id = c.hire_line_id join assets a on a.id = hl.asset_id join hires h on h.id = hl.hire_id',
    cols: 'c.*, a.code as asset_code, h.ref as hire_ref',
    exact: 'false',
    fuzzy: 'c.description ilike $1 or a.code ilike $1 or h.ref ilike $1',
    label: (r) => `${short(r.id)}  ${r.hire_ref} ${r.asset_code}: ${truncate(r.description, 40)} (${r.status})`,
    order: 'c.reported_on desc',
    listing: 'damage --all',
  },
  delivery: {
    from: 'deliveries c join hires h on h.id = c.hire_id join customers cu on cu.id = h.customer_id',
    cols: 'c.*, h.ref as hire_ref, cu.name as customer_name',
    exact: 'false',
    fuzzy: "h.ref ilike $1 or cu.name ilike $1 or coalesce(c.note, '') ilike $1",
    label: (r) => `${short(r.id)}  ${r.kind} ${r.hire_ref} ${r.customer_name} ${isoDate(r.scheduled_on)} (${r.status})`,
    order: 'c.scheduled_on',
    listing: 'runsheet',
  },
  task: {
    from: 'tasks c left join customers cu on cu.id = c.customer_id',
    cols: 'c.*, cu.name as customer_name',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or cu.name ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 50)} (${r.status})`,
    order: 'c.due_on',
    listing: 'tasks --all',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, code or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length && spec.exact !== 'false') rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a code, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

async function nextRef(db, tbl, col, prefix, start) {
  const rows = await db.query(`select ${col} as v from ${tbl} where ${col} like '${prefix}-%'`);
  let max = start;
  for (const r of rows) {
    const n = Number(String(r.v).slice(prefix.length + 1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${max + 1}`;
}

// ---------------------------------------------------------------------------
// Output

let JSON_MODE = false;
function out(json, text) {
  if (JSON_MODE) console.log(JSON.stringify(json, null, 2));
  else console.log(typeof text === 'function' ? text() : text);
}

const flagOn = (r, cond, label) => (cond ? label : '');

// ---------------------------------------------------------------------------
// Fleet blocks: why a machine cannot lawfully go out today. Read by `hire
// start`, `availability` and `/compliance`. One definition.

async function fleetRow(db, assetId) {
  const rows = await db.query('select * from v_fleet where asset_id = $1', [assetId]);
  return rows[0] || null;
}

function blockReasons(f) {
  const reasons = [];
  if (!f) return reasons;
  if (f.service_overdue) reasons.push('service overdue (HSWA 2015 ss 36 and 42: plant supplied must be safe and maintained)');
  if (f.tag_due) reasons.push('electrical test tag expired or missing (Electricity (Safety) Regulations 2010; AS/NZS 3760)');
  if (f.inspection_expired) reasons.push(`periodic inspection expired (${f.inspection_kind === 'crane-annual' ? 'PECPR Regulations 1999' : 'WorkSafe MEWP guidance, AS 2550.10: 6-monthly'})`);
  if (f.status === 'workshop') reasons.push('in the workshop');
  if (f.status === 'off-fleet') reasons.push('off fleet');
  return reasons;
}

// ---------------------------------------------------------------------------
// The compliance rule book. Sources and fixes live in docs/compliance.md; the
// SQL here and the words there change together (that is what /customise is for).

const RULES = [
  {
    key: 'safe-plant',
    title: 'No machine on hire with its service overdue',
    source: 'HSWA 2015 ss 36 and 42; General Risk and Workplace Management Regulations 2016 (plant must be maintained)',
    fix: 'Swap or service the machine now: service book, then service done with the meter reading.',
    sql: `select h.ref, c.name as customer, a.code, a.description,
                 f.hours_over_service, a.last_service_on
          from hire_lines hl
          join hires h on h.id = hl.hire_id
          join customers c on c.id = h.customer_id
          join assets a on a.id = hl.asset_id
          join v_fleet f on f.asset_id = a.id
          where hl.on_hired_on is not null and hl.off_hired_on is null and f.service_overdue`,
  },
  {
    key: 'pre-hire-checks',
    title: 'A recorded pre-hire check on everything that goes out',
    source: 'HSWA 2015 s 42 (supply duties); AS/NZS 3760 (hire equipment is inspected before each hire)',
    fix: 'check <ref> before anything leaves the yard. hire start refuses without it; backfill honestly if the check truly happened.',
    sql: `select h.ref, c.name as customer, a.code, a.description, hl.on_hired_on
          from hire_lines hl
          join hires h on h.id = hl.hire_id
          join customers c on c.id = h.customer_id
          join assets a on a.id = hl.asset_id
          where hl.on_hired_on is not null and hl.off_hired_on is null and hl.pre_hire_check_on is null`,
  },
  {
    key: 'test-and-tag',
    title: 'Current test tags on all electrical gear in the hire fleet',
    source: 'Electricity (Safety) Regulations 2010; AS/NZS 3760 in-service testing (AS/NZS 3012 on construction sites: 3-monthly)',
    fix: 'tag <asset> --tested= after the test. Gear with no current tag does not go out.',
    sql: `select f.code, f.description, f.tag_tested_on,
                 case when f.on_hire then 'ON HIRE with ' || f.with_customer else 'in the yard' end as where_it_is
          from v_fleet f
          where f.tag_due`,
  },
  {
    key: 'certified-access-plant',
    title: 'Current periodic inspections on MEWPs and cranes',
    source: 'WorkSafe MEWP guidance and AS 2550.10 (6-monthly periodic inspection); PECPR Regulations 1999 (cranes: annual certificate)',
    fix: 'Book the inspection, then inspection <asset> --expires= from the certificate.',
    sql: `select f.code, f.description, f.inspection_kind, f.inspection_expires_on,
                 case when f.on_hire then 'ON HIRE with ' || f.with_customer else 'in the yard' end as where_it_is
          from v_fleet f
          where f.inspection_expired`,
  },
  {
    key: 'ppsr',
    title: 'PPSR registration on any hire closing in on a year',
    source: 'Personal Property Securities Act 1999 ss 16 and 17: a lease for a term of more than 1 year is a security interest; unregistered, the machine can be lost to the customer\'s insolvency',
    fix: 'Register the financing statement on ppsr.govt.nz, then ppsr <ref> --registered=.',
    sql: `select h.ref, c.name as customer, h.site, h.start_on,
                 (current_date - h.start_on) as days_running
          from hires h join customers c on c.id = h.customer_id
          where h.status = 'live' and h.ppsr_registered_on is null and current_date - h.start_on >= 300`,
  },
  {
    key: 'consumer-terms',
    title: 'No contracting out of the CGA against a consumer',
    source: 'Consumer Guarantees Act 1993 (hire is a supply of goods; s 43 allows contracting out only where the customer is in trade)',
    fix: 'contract <ref> --include-cga, and fix the paper contract to match.',
    sql: `select h.ref, c.name as customer, c.account_type, h.start_on
          from hires h join customers c on c.id = h.customer_id
          where h.status in ('booked', 'live', 'off-hired') and h.cga_excluded and c.account_type = 'consumer'`,
  },
];

// ---------------------------------------------------------------------------
// Commands

const commands = {};

commands.help = async () => {
  console.log(`equipment-hire-for-claude-code: the fleet, the contracts, the meter and the money.

  The yard
    fleet [--category=] [--all]        every machine and its three clocks
    asset <code>                       one machine: position, history, money
    availability [category]            what can go out today, and what is blocked
    utilisation                        fleet earning by category

  Contracts
    board | hires [--all]              the hire board
    hire <ref>                         one contract in full
    hire book <customer> --site= --assets=A,B [--start=] [--end=] [--po=] [--by=]
    check <ref> [asset|all] [--by=]    record the pre-hire check
    hire start <ref> [--on=]           gear leaves the yard (refuses unchecked or blocked gear)
    off-hire <ref> [asset] [--on=] [--pickup= --driver=]
    pickup <ref> [asset] [--on=]       gear back in the yard
    hire close <ref>                   refuses over unbilled charge or open damage
    hire cancel <ref>
    off-hires                          the off-hire queue: over-running and awaiting pickup
    contract <ref> [--signed=] [--include-cga|--exclude-cga]
    ppsr <ref> [--registered=]

  The runsheet
    runsheet [--date=]                 today's deliveries and pickups
    delivery add <ref> deliver|pickup --on= [--driver=]
    delivery done <match> [--on=]

  The workshop
    service                            due, overdue and in the workshop
    service book <asset> [--kind=scheduled|repair|tag-test|inspection] [--due=] [--note=]
    service start <match>              into the workshop
    service done <match> [--cost=] [--meter=] [--expires=]
    meter <asset> <hours>              new meter reading
    tag <asset> [--tested=]            record the electrical test tag
    inspection <asset> --expires=      record the periodic inspection

  Damage
    damage [--all]                     the register
    damage add <ref> <asset> "<what>" [--cost=]
    damage charge <match> [--amount=]  goes onto the next bill
    damage waive <match> --reason=

  The money
    bill <ref|run> [--to=]             draft the invoice(s) from the meter
    unbilled                           charge accrued and not yet drafted
    invoices [--all] | invoice <number> | invoice sent|paid <number> [--on=]
    debtors                            aged debtors

  The desk
    customers | customer <name>        accounts, exposure, history
    staff | add customer|staff|asset   people and records
    stop <customer> | unstop <customer>
    log <ref|customer> "<note>" [--channel=] [--by=]
    tasks [--all] | task add "<title>" [--customer=] [--due=] | task done <match>
    attention                          everything that wants a decision, worst first
    compliance [rule]                  the six rules, run against the records
    stats                              the whole yard in one block
    import baseplan|csv --customers= --assets= --hires= [--dry-run]
    export [--out=]

  Every command takes --json. Matching is forgiving: codes, partial names, id prefixes.`);
};

// ---- the yard --------------------------------------------------------------

commands.fleet = async (db, args, flags) => {
  let sql = 'select * from v_fleet';
  const params = [];
  if (flags.category) {
    sql += ' where category ilike $1';
    params.push(`%${str(flags.category)}%`);
  }
  sql += ' order by category, code';
  let rows = await db.query(sql, params);
  if (!flags.all) rows = rows.filter((r) => r.status !== 'off-fleet');
  out(rows, () => heading(`The fleet (${rows.length} machines)`) + '\n' + table(rows, [
    { key: 'code', label: 'Code' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Machine', width: 34 },
    { key: 'on_hire', label: 'Where', format: (v, r) => (v ? `on hire: ${r.with_customer}` : r.status === 'workshop' ? 'WORKSHOP' : 'yard') },
    { key: 'meter_hours', label: 'Meter', align: 'right', format: (v) => (v == null ? '' : `${v}h`) },
    { key: 'service_overdue', label: 'Service', format: (v, r) => (v ? `OVERDUE${r.hours_over_service ? ' ' + r.hours_over_service + 'h' : ''}` : 'ok') },
    { key: 'tag_due', label: 'Tag', format: (v, r) => (r.electrical === false && !v ? '' : v ? 'DUE' : 'ok') },
    { key: 'inspection_expires_on', label: 'Inspection', format: (v, r) => (r.inspection_kind ? (r.inspection_expired ? `EXPIRED ${isoDate(v)}` : isoDate(v)) : '') },
    { key: 'day_rate_cents', label: 'Day', align: 'right', format: (v) => money(v) },
    { key: 'week_rate_cents', label: 'Week', align: 'right', format: (v) => money(v) },
    { key: 'days_idle', label: 'Idle', align: 'right', format: (v) => (v && v > 30 ? `${v}d` : '') },
  ]));
};

commands.asset = async (db, args) => {
  const a = await resolve(db, 'asset', args[0]);
  const f = await fleetRow(db, a.id);
  const lines = await db.query(
    `select h.ref, c.name as customer, h.site, hl.on_hired_on, hl.off_hired_on, hl.picked_up_on, lc.total_days, lc.unbilled_cents
     from hire_lines hl join hires h on h.id = hl.hire_id join customers c on c.id = h.customer_id
     join v_line_charge lc on lc.line_id = hl.id
     where hl.asset_id = $1 order by hl.on_hired_on desc nulls first limit 12`, [a.id]);
  const jobs = await db.query('select * from services where asset_id = $1 order by opened_on desc limit 12', [a.id]);
  const dmg = await db.query(
    `select dr.reported_on, dr.description, dr.est_cost_cents, dr.status from damage_reports dr
     join hire_lines hl on hl.id = dr.hire_line_id where hl.asset_id = $1 order by dr.reported_on desc`, [a.id]);
  out({ asset: a, position: f, hires: lines, services: jobs, damage: dmg }, () => {
    const blocks = blockReasons(f);
    let t = heading(`${a.code}  ${a.description}`);
    t += `\n  ${a.category} | ${a.make || ''} ${a.model || ''} | serial ${a.serial || 'n/a'} | ${money(a.day_rate_cents)}/day ${money(a.week_rate_cents)}/week`;
    t += `\n  ${f?.on_hire ? `ON HIRE with ${f.with_customer} (${f.hire_ref})` : a.status === 'workshop' ? 'IN THE WORKSHOP' : `in the yard${f?.days_idle ? `, idle ${f.days_idle} days` : ''}`}`;
    if (a.meter_hours != null) t += `\n  meter ${a.meter_hours}h | last service ${isoDate(a.last_service_on) || 'never'}${a.last_service_hours != null ? ` at ${a.last_service_hours}h` : ''}${a.service_interval_hours ? ` | interval ${a.service_interval_hours}h` : ''}`;
    if (a.electrical) t += `\n  test tag: ${a.tag_tested_on ? `tested ${isoDate(a.tag_tested_on)} (${a.tag_interval_months} monthly)` : 'NEVER TESTED'}`;
    if (a.inspection_kind) t += `\n  ${a.inspection_kind}: expires ${isoDate(a.inspection_expires_on) || 'NOT ON FILE'}`;
    t += `\n  last 12 months: earned ${money(f?.revenue_365_cents)} | workshop cost ${money(f?.service_cost_365_cents)}`;
    if (blocks.length) t += `\n  BLOCKED: ${blocks.join('; ')}`;
    if (lines.length) t += '\n' + heading('Hire history') + '\n' + table(lines, [
      { key: 'ref', label: 'Ref' },
      { key: 'customer', label: 'Customer', width: 26 },
      { key: 'on_hired_on', label: 'Out', format: isoDate },
      { key: 'off_hired_on', label: 'Off', format: (v) => isoDate(v) || 'on hire' },
      { key: 'total_days', label: 'Days', align: 'right' },
      { key: 'unbilled_cents', label: 'Unbilled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    ]);
    if (jobs.length) t += '\n' + heading('Workshop') + '\n' + table(jobs, [
      { key: 'opened_on', label: 'Opened', format: isoDate },
      { key: 'kind', label: 'Job' },
      { key: 'status', label: 'Status' },
      { key: 'done_on', label: 'Done', format: isoDate },
      { key: 'cost_cents', label: 'Cost', align: 'right', format: (v) => (v == null ? '' : money(v)) },
      { key: 'note', label: 'Note', width: 40 },
    ]);
    if (dmg.length) t += '\n' + heading('Damage history') + '\n' + table(dmg, [
      { key: 'reported_on', label: 'Reported', format: isoDate },
      { key: 'description', label: 'What', width: 44 },
      { key: 'est_cost_cents', label: 'Est', align: 'right', format: (v) => (v == null ? '' : money(v)) },
      { key: 'status', label: 'Status' },
    ]);
    return t;
  });
};

commands.availability = async (db, args, flags) => {
  let sql = 'select * from v_availability';
  const params = [];
  if (args[0]) {
    sql += ' where category ilike $1';
    params.push(`%${args[0]}%`);
  }
  sql += ' order by category, code';
  let rows = await db.query(sql, params);
  if (flags.blocked) rows = rows.filter((r) => r.blocked);
  out(rows, () => {
    const free = rows.filter((r) => !r.blocked);
    const blocked = rows.filter((r) => r.blocked);
    let t = heading(`Available now (${free.length})`) + '\n' + table(free, [
      { key: 'code', label: 'Code' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Machine', width: 34 },
      { key: 'day_rate_cents', label: 'Day', align: 'right', format: (v) => money(v) },
      { key: 'week_rate_cents', label: 'Week', align: 'right', format: (v) => money(v) },
      { key: 'next_booked_on', label: 'Next booking', format: (v) => (v ? isoDate(v) : '') },
    ]);
    if (blocked.length) t += '\n' + heading(`In the yard but cannot go out (${blocked.length})`) + '\n' + table(blocked, [
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Machine', width: 34 },
      { key: 'blocked_reason', label: 'Why' },
    ]);
    return t;
  });
};

commands.utilisation = async (db) => {
  const rows = await db.query('select * from v_utilisation order by utilisation_pct desc, category');
  out(rows, () => heading('Utilisation by category') + '\n' + table(rows, [
    { key: 'category', label: 'Category' },
    { key: 'fleet', label: 'Fleet', align: 'right' },
    { key: 'on_hire', label: 'On hire', align: 'right' },
    { key: 'utilisation_pct', label: '%', align: 'right', format: (v) => `${v}%` },
    { key: 'utilisation_pct', label: '', format: (v) => bar(v) },
    { key: 'in_workshop', label: 'Workshop', align: 'right', format: (v) => (num(v) ? v : '') },
    { key: 'idle_90d', label: 'Idle 90d+', align: 'right', format: (v) => (num(v) ? v : '') },
    { key: 'idle_day_rate_cents', label: 'Idle $/day', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'revenue_365_cents', label: 'Earned 12mo', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'service_cost_365_cents', label: 'Workshop 12mo', align: 'right', format: (v) => (num(v) ? money(v) : '') },
  ]) + '\n\n  Earned 12mo counts invoiced lines only; the accrued meter is in `unbilled`.');
};

// ---- contracts ---------------------------------------------------------------

async function hireCard(db, h) {
  const lines = await db.query(
    `select hl.*, a.code, a.description, lc.total_days, lc.unbilled_days, lc.unbilled_cents, lc.charge_until, s.full_name as checked_by
     from hire_lines hl
     join assets a on a.id = hl.asset_id
     join v_line_charge lc on lc.line_id = hl.id
     left join staff s on s.id = hl.pre_hire_check_by
     where hl.hire_id = $1 order by a.code`, [h.id]);
  const dels = await db.query(
    `select d.*, s.full_name as driver from deliveries d left join staff s on s.id = d.driver_id
     where d.hire_id = $1 order by d.scheduled_on`, [h.id]);
  const invs = await db.query('select * from invoices where hire_id = $1 order by issued_on', [h.id]);
  const dmg = await db.query(
    `select dr.*, a.code as asset_code from damage_reports dr
     join hire_lines hl on hl.id = dr.hire_line_id join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 order by dr.reported_on`, [h.id]);
  const noteRows = await db.query(
    `select n.*, s.full_name as by_whom from notes n left join staff s on s.id = n.staff_id
     where n.hire_id = $1 order by n.noted_on desc limit 8`, [h.id]);
  return { hire: h, lines, deliveries: dels, invoices: invs, damage: dmg, notes: noteRows };
}

commands.hire = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'book') return commands['hire-book'](db, args.slice(1), flags);
  if (sub === 'start') return commands['hire-start'](db, args.slice(1), flags);
  if (sub === 'close') return commands['hire-close'](db, args.slice(1), flags);
  if (sub === 'cancel') return commands['hire-cancel'](db, args.slice(1), flags);
  const h = await resolve(db, 'hire', args.join(' '));
  const card = await hireCard(db, h);
  out(card, () => {
    let t = heading(`${h.ref}  ${h.customer_name} (${h.status.toUpperCase()})`);
    t += `\n  site: ${h.site}${h.po_number ? ` | PO ${h.po_number}` : ''}`;
    t += `\n  start ${isoDate(h.start_on)}${h.expected_end_on ? ` | expected end ${isoDate(h.expected_end_on)}` : ' | open-ended'}${h.off_hired_on ? ` | off hire ${isoDate(h.off_hired_on)}` : ''}${h.closed_on ? ` | closed ${isoDate(h.closed_on)}` : ''}`;
    t += `\n  contract ${h.contract_signed_on ? `signed ${isoDate(h.contract_signed_on)}` : 'NOT SIGNED'}${h.cga_excluded ? ' | CGA excluded' + (h.account_type === 'consumer' ? ' (VOID: consumer customer, CGA 1993 s 43)' : '') : ''}`;
    const daysRunning = h.status === 'live' ? daysBetween(isoDate(h.start_on), today()) : null;
    if (daysRunning != null && daysRunning >= 300) t += `\n  running ${daysRunning} days | PPSR ${h.ppsr_registered_on ? `registered ${isoDate(h.ppsr_registered_on)}` : 'NOT REGISTERED (PPSA 1999: register before the year turns)'}`;
    if (h.note) t += `\n  note: ${h.note}`;
    t += '\n' + heading('Gear') + '\n' + table(card.lines, [
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Machine', width: 32 },
      { key: 'on_hired_on', label: 'Out', format: (v) => isoDate(v) || 'booked' },
      { key: 'off_hired_on', label: 'Off', format: (v, r) => isoDate(v) || (r.on_hired_on ? 'on hire' : '') },
      { key: 'picked_up_on', label: 'Back in yard', format: (v, r) => isoDate(v) || (r.off_hired_on ? 'AWAITING PICKUP' : '') },
      { key: 'pre_hire_check_on', label: 'Checked', format: (v, r) => (v ? `${isoDate(v)}${r.checked_by ? ' ' + r.checked_by.split(' ')[0] : ''}` : 'NO CHECK') },
      { key: 'day_rate_cents', label: 'Day', align: 'right', format: (v) => money(v) },
      { key: 'week_rate_cents', label: 'Week', align: 'right', format: (v) => money(v) },
      { key: 'unbilled_cents', label: 'Unbilled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    ]);
    if (card.deliveries.length) t += '\n' + heading('Transport') + '\n' + table(card.deliveries, [
      { key: 'kind', label: 'Kind' },
      { key: 'scheduled_on', label: 'Scheduled', format: isoDate },
      { key: 'driver', label: 'Driver' },
      { key: 'status', label: 'Status' },
      { key: 'note', label: 'Note', width: 40 },
    ]);
    if (card.damage.length) t += '\n' + heading('Damage') + '\n' + table(card.damage, [
      { key: 'asset_code', label: 'Code' },
      { key: 'reported_on', label: 'Reported', format: isoDate },
      { key: 'description', label: 'What', width: 44 },
      { key: 'est_cost_cents', label: 'Est', align: 'right', format: (v) => (v == null ? '' : money(v)) },
      { key: 'status', label: 'Status' },
    ]);
    if (card.invoices.length) t += '\n' + heading('Invoices') + '\n' + table(card.invoices, [
      { key: 'number', label: 'Number' },
      { key: 'issued_on', label: 'Issued', format: isoDate },
      { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status' },
    ]);
    if (card.notes.length) t += '\n' + heading('Notes') + '\n' + table(card.notes, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'by_whom', label: 'Who' },
      { key: 'note', label: 'Note', width: 70 },
    ]);
    return t;
  });
};

commands.board = async (db, args, flags) => {
  const rows = await db.query("select * from v_hire_board order by case status when 'live' then 0 when 'off-hired' then 1 else 2 end, start_on");
  let all = rows;
  if (flags.all) {
    const closed = await db.query(
      `select h.ref, c.name as customer, h.site, h.status, h.start_on, h.off_hired_on
       from hires h join customers c on c.id = h.customer_id where h.status in ('closed', 'cancelled') order by h.start_on desc`);
    all = { open: rows, closed };
  }
  out(all, () => heading(`The hire board (${rows.length})`) + '\n' + table(rows, [
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 26, format: (v, r) => v + (r.on_stop ? ' [STOP]' : '') },
    { key: 'site', label: 'Site', width: 28 },
    { key: 'status', label: 'Status' },
    { key: 'gear', label: 'Gear', width: 24 },
    { key: 'start_on', label: 'Start', format: isoDate },
    { key: 'expected_end_on', label: 'Expected end', format: (v, r) => (v ? isoDate(v) + (r.days_over ? ` (${r.days_over}d OVER)` : '') : 'open') },
    { key: 'week_value_cents', label: '$/week', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'unbilled_cents', label: 'Unbilled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
  ]));
};
commands.hires = commands.board;

commands['hire-book'] = async (db, args, flags) => {
  const cust = await resolve(db, 'customer', args.join(' ') || str(flags.customer));
  if (cust.on_stop && !flags.force) {
    throw new CliError(`${cust.name} is ON STOP. Settle the account or take a deliberate decision: --force with a --note, and it goes in the record.`);
  }
  const site = str(flags.site);
  if (!site) throw new CliError('Every hire has a site: --site="Pyes Pa subdivision stage 2".');
  const assetArgs = str(flags.assets).split(',').map((s) => s.trim()).filter(Boolean);
  if (!assetArgs.length) throw new CliError('Which gear? --assets=EX-101,TR-981 (codes, names or id prefixes).');
  const startOn = parseDate(flags.start, 'start date') || today();
  const endOn = parseDate(flags.end, 'end date');
  const by = flags.by ? await resolve(db, 'staff', str(flags.by)) : null;

  const assets = [];
  for (const q of assetArgs) {
    const a = await resolve(db, 'asset', q);
    if (a.status === 'off-fleet') throw new CliError(`${a.code} is off fleet.`);
    const open = await db.query(
      `select h.ref, h.status from hire_lines hl join hires h on h.id = hl.hire_id
       where hl.asset_id = $1 and h.status in ('booked', 'live') and hl.off_hired_on is null`, [a.id]);
    if (open.length) throw new CliError(`${a.code} is already committed on ${open[0].ref} (${open[0].status}). Off-hire it there or pick another machine.`);
    assets.push(a);
  }

  const ref = await nextRef(db, 'hires', 'ref', 'HC', 1000);
  const [h] = await db.query(
    `insert into hires (ref, customer_id, site, po_number, status, start_on, expected_end_on, taken_by_id, note)
     values ($1, $2, $3, $4, 'booked', $5, $6, $7, $8) returning *`,
    [ref, cust.id, site, str(flags.po) || null, startOn, endOn, by?.id || null, str(flags.note) || null]);
  for (const a of assets) {
    await db.query(
      'insert into hire_lines (hire_id, asset_id, day_rate_cents, week_rate_cents) values ($1, $2, $3, $4)',
      [h.id, a.id, a.day_rate_cents, a.week_rate_cents]);
  }
  if (cust.on_stop) await db.query('insert into notes (customer_id, hire_id, noted_on, channel, note) values ($1, $2, $3, $4, $5)',
    [cust.id, h.id, today(), 'yard', `Booked with the account ON STOP, --force used: ${str(flags.note) || 'no note given'}`]);
  out({ ref, hire_id: h.id, customer: cust.name, assets: assets.map((a) => a.code), start_on: startOn },
    `  booked ${ref} for ${cust.name}: ${assets.map((a) => a.code).join(', ')} at "${site}" from ${startOn}${endOn ? ` to ${endOn}` : ''}.\n  Next: check ${ref}, then hire start ${ref} when it leaves the yard.`);
};

commands.check = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  const onDate = parseDate(flags.on, 'check date') || today();
  const by = flags.by ? await resolve(db, 'staff', str(flags.by)) : null;
  let lines = await db.query(
    `select hl.*, a.code from hire_lines hl join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and hl.off_hired_on is null`, [h.id]);
  if (args[1] && args[1] !== 'all') {
    const a = await resolve(db, 'asset', args[1]);
    lines = lines.filter((l) => l.asset_id === a.id);
    if (!lines.length) throw new CliError(`${a.code} is not an open line on ${h.ref}.`);
  }
  if (!lines.length) throw new CliError(`${h.ref} has no open lines to check.`);
  for (const l of lines) {
    await db.query('update hire_lines set pre_hire_check_on = $1, pre_hire_check_by = $2 where id = $3', [onDate, by?.id || null, l.id]);
  }
  out({ ref: h.ref, checked: lines.map((l) => l.code), on: onDate },
    `  pre-hire check recorded on ${lines.map((l) => l.code).join(', ')} (${h.ref}) for ${onDate}${by ? ` by ${by.full_name}` : ''}.`);
};

commands['hire-start'] = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  if (!['booked', 'live'].includes(h.status)) throw new CliError(`${h.ref} is ${h.status}; only a booked (or partly started) hire starts.`);
  const onDate = parseDate(flags.on, 'start date') || today();
  const lines = await db.query(
    `select hl.*, a.code, a.description from hire_lines hl join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and hl.on_hired_on is null`, [h.id]);
  if (!lines.length) throw new CliError(`Every line on ${h.ref} is already out.`);

  const problems = [];
  for (const l of lines) {
    if (!l.pre_hire_check_on) problems.push(`${l.code}: no pre-hire check recorded. Run \`check ${h.ref}\` first (HSWA 2015 s 42; AS/NZS 3760: hire gear is inspected before each hire).`);
    const f = await fleetRow(db, l.asset_id);
    for (const reason of blockReasons(f)) problems.push(`${l.code}: ${reason}.`);
  }
  if (problems.length && !flags.force) {
    throw new CliError(`Not leaving the yard:\n  ${problems.join('\n  ')}\nFix it, swap the machine, or --force with a --note if you are certain, and the override goes in the record.`);
  }
  for (const l of lines) {
    await db.query('update hire_lines set on_hired_on = $1 where id = $2', [onDate, l.id]);
  }
  await db.query("update hires set status = 'live', start_on = least(start_on, $1) where id = $2", [onDate, h.id]);
  if (problems.length) {
    await db.query('insert into notes (customer_id, hire_id, noted_on, channel, note) values ($1, $2, $3, $4, $5)',
      [h.customer_id, h.id, today(), 'yard', `hire start FORCED over: ${problems.join(' | ')} :: ${str(flags.note) || 'no note given'}`]);
  }
  out({ ref: h.ref, started: lines.map((l) => l.code), on: onDate, forced: Boolean(problems.length) },
    `  ${h.ref} live: ${lines.map((l) => l.code).join(', ')} on hire from ${onDate}.${problems.length ? ' OVERRIDE RECORDED.' : ''}`);
};

commands['off-hire'] = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  const onDate = parseDate(flags.on, 'off-hire date') || today();
  let lines = await db.query(
    `select hl.*, a.code from hire_lines hl join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and hl.on_hired_on is not null and hl.off_hired_on is null`, [h.id]);
  if (args[1]) {
    const a = await resolve(db, 'asset', args[1]);
    lines = lines.filter((l) => l.asset_id === a.id);
    if (!lines.length) throw new CliError(`${a.code} is not on hire on ${h.ref}.`);
  }
  if (!lines.length) throw new CliError(`Nothing on ${h.ref} is on hire.`);
  for (const l of lines) {
    await db.query('update hire_lines set off_hired_on = $1 where id = $2', [onDate, l.id]);
  }
  const still = await db.query('select count(*)::int as n from hire_lines where hire_id = $1 and on_hired_on is not null and off_hired_on is null', [h.id]);
  if (num(still[0].n) === 0) {
    await db.query("update hires set status = 'off-hired', off_hired_on = $1 where id = $2", [onDate, h.id]);
  }
  let pickupMsg = '';
  if (flags.pickup) {
    const pOn = parseDate(flags.pickup, 'pickup date');
    const driver = flags.driver ? await resolve(db, 'staff', str(flags.driver)) : null;
    await db.query("insert into deliveries (hire_id, kind, scheduled_on, driver_id, note) values ($1, 'pickup', $2, $3, $4)",
      [h.id, pOn, driver?.id || null, str(flags.note) || null]);
    pickupMsg = ` Pickup scheduled ${pOn}${driver ? ` (${driver.full_name})` : ''}.`;
  }
  out({ ref: h.ref, off_hired: lines.map((l) => l.code), on: onDate },
    `  off hire: ${lines.map((l) => l.code).join(', ')} on ${h.ref}, charging stopped the day before ${onDate === today() ? 'today' : onDate}.${pickupMsg}\n  Next: pickup ${h.ref} when it is back, damage add if the return check finds anything, then bill ${h.ref}.`);
};

commands.pickup = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  const onDate = parseDate(flags.on, 'pickup date') || today();
  let lines = await db.query(
    `select hl.*, a.code from hire_lines hl join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and hl.off_hired_on is not null and hl.picked_up_on is null`, [h.id]);
  if (args[1]) {
    const a = await resolve(db, 'asset', args[1]);
    lines = lines.filter((l) => l.asset_id === a.id);
    if (!lines.length) throw new CliError(`${a.code} is not awaiting pickup on ${h.ref}.`);
  }
  if (!lines.length) throw new CliError(`Nothing on ${h.ref} is awaiting pickup.`);
  for (const l of lines) {
    await db.query('update hire_lines set picked_up_on = $1 where id = $2', [onDate, l.id]);
  }
  out({ ref: h.ref, picked_up: lines.map((l) => l.code), on: onDate },
    `  back in the yard: ${lines.map((l) => l.code).join(', ')} (${h.ref}). Do the return check and log any damage now, while it can still be charged.`);
};

commands['hire-close'] = async (db, args) => {
  const h = await resolve(db, 'hire', args[0]);
  if (h.status === 'closed') throw new CliError(`${h.ref} is already closed.`);
  const open = await db.query(
    'select count(*)::int as n from hire_lines where hire_id = $1 and (off_hired_on is null or picked_up_on is null) and on_hired_on is not null', [h.id]);
  if (num(open[0].n)) throw new CliError(`${h.ref} still has gear out or awaiting pickup. off-hire and pickup first.`);
  const [{ unbilled }] = await db.query('select coalesce(sum(unbilled_cents), 0)::bigint as unbilled from v_line_charge where hire_id = $1', [h.id]);
  if (num(unbilled) > 0) throw new CliError(`${h.ref} has ${money(unbilled)} accrued and not drafted. Run \`bill ${h.ref}\` first: closed hires do not get billed later.`);
  const dmg = await db.query(
    `select count(*)::int as n from damage_reports dr join hire_lines hl on hl.id = dr.hire_line_id
     where hl.hire_id = $1 and (dr.status = 'open' or (dr.status = 'charged' and dr.invoice_id is null))`, [h.id]);
  if (num(dmg[0].n)) throw new CliError(`${h.ref} has damage not yet charged or waived. damage charge / damage waive, bill it, then close.`);
  await db.query("update hires set status = 'closed', closed_on = current_date where id = $1", [h.id]);
  out({ ref: h.ref, status: 'closed' }, `  ${h.ref} closed.`);
};

commands['hire-cancel'] = async (db, args) => {
  const h = await resolve(db, 'hire', args[0]);
  if (h.status !== 'booked') throw new CliError(`${h.ref} is ${h.status}; only a booked hire cancels. Off-hire and close a live one.`);
  await db.query("update hires set status = 'cancelled' where id = $1", [h.id]);
  out({ ref: h.ref, status: 'cancelled' }, `  ${h.ref} cancelled.`);
};

commands['off-hires'] = async (db) => {
  const rows = await db.query('select * from v_off_hire_queue order by days desc');
  out(rows, () => heading(`The off-hire queue (${rows.length})`) + '\n' + table(rows, [
    { key: 'reason', label: 'What' },
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 26 },
    { key: 'asset_code', label: 'Code' },
    { key: 'asset', label: 'Machine', width: 30 },
    { key: 'site', label: 'Site', width: 24 },
    { key: 'expected_end_on', label: 'Since', format: isoDate },
    { key: 'days', label: 'Days', align: 'right' },
    { key: 'unbilled_cents', label: 'On the meter', align: 'right', format: (v) => (num(v) ? money(v) : '') },
  ]) + '\n\n  "Running past expected end" is charging and the customer may not mean it to be: ring them, then off-hire or extend.');
};

commands.contract = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  const sets = [];
  const params = [];
  if (flags.signed) {
    params.push(parseDate(flags.signed === true ? 'today' : flags.signed, 'signed date'));
    sets.push(`contract_signed_on = $${params.length}`);
  }
  if (flags['include-cga']) sets.push('cga_excluded = false');
  if (flags['exclude-cga']) {
    if (h.account_type === 'consumer') {
      throw new CliError(`${h.customer_name} is a consumer. Contracting out of the CGA is only lawful where the customer is in trade (CGA 1993 s 43); against a consumer the clause is void and writing it is a Fair Trading Act risk. Not recording it.`);
    }
    sets.push('cga_excluded = true');
  }
  if (!sets.length) throw new CliError('Nothing to record: --signed=[date], --include-cga or --exclude-cga.');
  params.push(h.id);
  await db.query(`update hires set ${sets.join(', ')} where id = $${params.length}`, params);
  out({ ref: h.ref, updated: sets }, `  ${h.ref} contract record updated.`);
};

commands.ppsr = async (db, args, flags) => {
  const h = await resolve(db, 'hire', args[0]);
  const onDate = parseDate(flags.registered === true || !flags.registered ? 'today' : flags.registered, 'registration date');
  await db.query('update hires set ppsr_registered_on = $1 where id = $2', [onDate, h.id]);
  out({ ref: h.ref, ppsr_registered_on: onDate }, `  ${h.ref}: PPSR financing statement recorded as registered ${onDate}.`);
};

// ---- the runsheet -------------------------------------------------------------

commands.runsheet = async (db, args, flags) => {
  const date = parseDate(flags.date, 'runsheet date') || today();
  const rows = await db.query(
    `select * from v_runsheet where status = 'scheduled' and scheduled_on <= $1 order by scheduled_on, kind desc`, [date]);
  out(rows, () => heading(`Runsheet ${date} (${rows.length})`) + '\n' + table(rows, [
    { key: 'kind', label: 'Job' },
    { key: 'scheduled_on', label: 'Date', format: (v) => (isoDate(v) < date ? `${isoDate(v)} LATE` : isoDate(v)) },
    { key: 'driver', label: 'Driver' },
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 26 },
    { key: 'site', label: 'Site', width: 28 },
    { key: 'gear', label: 'Gear', width: 22 },
    { key: 'note', label: 'Note', width: 34 },
  ]));
};

commands.delivery = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'add') {
    const h = await resolve(db, 'hire', args[1]);
    const kind = args[2];
    if (!['deliver', 'pickup'].includes(kind)) throw new CliError('delivery add <ref> deliver|pickup --on= [--driver=]');
    const onDate = parseDate(flags.on, 'scheduled date') || today();
    const driver = flags.driver ? await resolve(db, 'staff', str(flags.driver)) : null;
    await db.query('insert into deliveries (hire_id, kind, scheduled_on, driver_id, note) values ($1, $2, $3, $4, $5)',
      [h.id, kind, onDate, driver?.id || null, str(flags.note) || null]);
    return out({ ref: h.ref, kind, scheduled_on: onDate }, `  ${kind} scheduled ${onDate} for ${h.ref}${driver ? ` (${driver.full_name})` : ''}.`);
  }
  if (sub === 'done') {
    const d = await resolve(db, 'delivery', args.slice(1).join(' '));
    const onDate = parseDate(flags.on, 'done date') || today();
    await db.query("update deliveries set status = 'done', done_on = $1 where id = $2", [onDate, d.id]);
    return out({ delivery_id: d.id, done_on: onDate }, `  ${d.kind} done for ${d.hire_ref} on ${onDate}.`);
  }
  throw new CliError('delivery add|done ...');
};

// ---- the workshop -------------------------------------------------------------

commands.service = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'book') return serviceBook(db, args.slice(1), flags);
  if (sub === 'start') return serviceStart(db, args.slice(1), flags);
  if (sub === 'done') return serviceDone(db, args.slice(1), flags);
  const jobs = await db.query(
    `select s.id, s.kind, s.status, s.opened_on, s.due_on, a.code, a.description, s.note,
            (current_date - s.opened_on) as days_open
     from services s join assets a on a.id = s.asset_id
     where s.status <> 'done' order by s.status desc, s.opened_on`);
  const clocks = await db.query(
    `select code, description, on_hire, with_customer, service_overdue, hours_over_service, tag_due, inspection_expired, inspection_expires_on
     from v_fleet where service_overdue or tag_due or inspection_expired order by on_hire desc, code`);
  out({ jobs, clocks }, () => {
    let t = heading(`Workshop queue (${jobs.length})`) + '\n' + table(jobs, [
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Machine', width: 32 },
      { key: 'kind', label: 'Job' },
      { key: 'status', label: 'Status' },
      { key: 'opened_on', label: 'Opened', format: isoDate },
      { key: 'days_open', label: 'Days', align: 'right' },
      { key: 'note', label: 'Note', width: 44 },
    ]);
    t += '\n' + heading(`Certificate and service clocks (${clocks.length})`) + '\n' + table(clocks, [
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Machine', width: 32 },
      { key: 'on_hire', label: 'Where', format: (v, r) => (v ? `ON HIRE: ${r.with_customer}` : 'yard') },
      { key: 'service_overdue', label: 'Service', format: (v, r) => (v ? `OVERDUE${r.hours_over_service ? ' ' + r.hours_over_service + 'h' : ''}` : '') },
      { key: 'tag_due', label: 'Tag', format: (v) => (v ? 'DUE' : '') },
      { key: 'inspection_expired', label: 'Inspection', format: (v, r) => (v ? `EXPIRED ${isoDate(r.inspection_expires_on)}` : '') },
    ]);
    return t;
  });
};

async function serviceBook(db, args, flags) {
  const a = await resolve(db, 'asset', args[0]);
  const kind = str(flags.kind) || 'scheduled';
  if (!['scheduled', 'repair', 'tag-test', 'inspection'].includes(kind)) throw new CliError('kind is scheduled | repair | tag-test | inspection');
  const due = parseDate(flags.due, 'due date') || today();
  const mech = flags.mechanic ? await resolve(db, 'staff', str(flags.mechanic)) : null;
  const [s] = await db.query(
    "insert into services (asset_id, kind, opened_on, due_on, status, mechanic_id, note) values ($1, $2, current_date, $3, 'due', $4, $5) returning id",
    [a.id, kind, due, mech?.id || null, str(flags.note) || null]);
  out({ service_id: s.id, asset: a.code, kind, due_on: due }, `  ${kind} booked for ${a.code}, due ${due}.`);
}

async function serviceStart(db, args) {
  const s = await resolve(db, 'service', args.join(' '));
  if (s.status === 'done') throw new CliError('That job is already done.');
  await db.query("update services set status = 'in-workshop' where id = $1", [s.id]);
  const f = await fleetRow(db, s.asset_id);
  if (f && !f.on_hire) await db.query("update assets set status = 'workshop' where id = $1", [s.asset_id]);
  out({ service_id: s.id, status: 'in-workshop' }, `  ${s.asset_code} ${s.kind}: in the workshop.${f?.on_hire ? ' (Machine is on hire; it stays on the board until it is back.)' : ''}`);
}

async function serviceDone(db, args, flags) {
  const s = await resolve(db, 'service', args.join(' '));
  if (s.status === 'done') throw new CliError('That job is already done.');
  const onDate = parseDate(flags.on, 'done date') || today();
  const cost = flags.cost !== undefined ? parseMoney(flags.cost) : null;
  await db.query("update services set status = 'done', done_on = $1, cost_cents = coalesce($2, cost_cents) where id = $3", [onDate, cost, s.id]);
  const [a] = await db.query('select * from assets where id = $1', [s.asset_id]);
  const meter = flags.meter !== undefined ? Number(flags.meter) : a.meter_hours;
  if (s.kind === 'scheduled') {
    await db.query('update assets set last_service_on = $1, last_service_hours = $2, meter_hours = coalesce($3, meter_hours) where id = $4',
      [onDate, meter ?? null, flags.meter !== undefined ? meter : null, a.id]);
  }
  if (s.kind === 'tag-test') await db.query('update assets set tag_tested_on = $1 where id = $2', [onDate, a.id]);
  if (s.kind === 'inspection') {
    const expires = parseDate(flags.expires, 'expiry date') || addDays(onDate, a.inspection_kind === 'crane-annual' ? 365 : 182);
    await db.query('update assets set inspection_expires_on = $1 where id = $2', [expires, a.id]);
  }
  if (a.status === 'workshop') {
    const others = await db.query("select count(*)::int as n from services where asset_id = $1 and status = 'in-workshop'", [a.id]);
    if (!num(others[0].n)) await db.query("update assets set status = 'in-fleet' where id = $1", [a.id]);
  }
  out({ service_id: s.id, done_on: onDate }, `  ${s.asset_code} ${s.kind} done ${onDate}${cost != null ? `, ${money(cost)}` : ''}. Clocks updated.`);
}

commands.meter = async (db, args) => {
  const a = await resolve(db, 'asset', args[0]);
  const hours = Number(args[1]);
  if (!Number.isFinite(hours) || hours < 0) throw new CliError('meter <asset> <hours>');
  if (a.meter_hours != null && hours < a.meter_hours) throw new CliError(`${a.code} already reads ${a.meter_hours}h; meters do not run backwards. If the meter was replaced, say so in a note and update the service baseline too.`);
  await db.query('update assets set meter_hours = $1 where id = $2', [hours, a.id]);
  const f = await fleetRow(db, a.id);
  out({ asset: a.code, meter_hours: hours, service_overdue: Boolean(f?.service_overdue) },
    `  ${a.code} meter ${hours}h.${f?.service_overdue ? ` SERVICE NOW OVERDUE${f.hours_over_service ? ` by ${f.hours_over_service}h` : ''}: book it.` : ''}`);
};

commands.tag = async (db, args, flags) => {
  const a = await resolve(db, 'asset', args[0]);
  if (!a.electrical) throw new CliError(`${a.code} is not flagged electrical. If it should be, customise the asset record.`);
  const onDate = parseDate(flags.tested === true || !flags.tested ? 'today' : flags.tested, 'test date');
  await db.query('update assets set tag_tested_on = $1 where id = $2', [onDate, a.id]);
  out({ asset: a.code, tag_tested_on: onDate }, `  ${a.code} test tag recorded ${onDate} (next due in ${a.tag_interval_months} months).`);
};

commands.inspection = async (db, args, flags) => {
  const a = await resolve(db, 'asset', args[0]);
  if (!a.inspection_kind) throw new CliError(`${a.code} carries no periodic inspection. If it should (a MEWP or crane), customise the asset record.`);
  const expires = parseDate(flags.expires, 'expiry date');
  if (!expires) throw new CliError('The certificate has an expiry: --expires=YYYY-MM-DD.');
  await db.query('update assets set inspection_expires_on = $1 where id = $2', [expires, a.id]);
  out({ asset: a.code, inspection_expires_on: expires }, `  ${a.code} ${a.inspection_kind} recorded, expires ${expires}.`);
};

// ---- damage --------------------------------------------------------------------

commands.damage = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'add') {
    const h = await resolve(db, 'hire', args[1]);
    const a = await resolve(db, 'asset', args[2]);
    const desc = args[3];
    if (!desc) throw new CliError('damage add <ref> <asset> "what the return check found" [--cost=]');
    const lines = await db.query('select * from hire_lines where hire_id = $1 and asset_id = $2', [h.id, a.id]);
    if (!lines.length) throw new CliError(`${a.code} is not a line on ${h.ref}.`);
    const onDate = parseDate(flags.on, 'reported date') || today();
    const [d] = await db.query(
      "insert into damage_reports (hire_line_id, reported_on, description, est_cost_cents, status) values ($1, $2, $3, $4, 'open') returning id",
      [lines[0].id, onDate, desc, flags.cost !== undefined ? parseMoney(flags.cost) : null]);
    return out({ damage_id: d.id, ref: h.ref, asset: a.code },
      `  damage recorded on ${a.code} (${h.ref}). Charge it or waive it this week, while the site conversation is still warm.`);
  }
  if (sub === 'charge') {
    const d = await resolve(db, 'damage', args.slice(1).join(' '));
    if (d.status === 'charged') throw new CliError('Already charged.');
    const amount = flags.amount !== undefined ? parseMoney(flags.amount) : num(d.est_cost_cents);
    if (!amount) throw new CliError('No estimate on the report: give --amount=.');
    await db.query("update damage_reports set status = 'charged', charged_cents = $1, waived_reason = null where id = $2", [amount, d.id]);
    return out({ damage_id: d.id, charged_cents: amount },
      `  ${d.asset_code} damage marked to charge ${money(amount)}. It rides out on the next \`bill ${d.hire_ref}\`.`);
  }
  if (sub === 'waive') {
    const d = await resolve(db, 'damage', args.slice(1).join(' '));
    const reason = str(flags.reason);
    if (!reason) throw new CliError('Waiving is a decision with a why: --reason="fair wear and tear".');
    await db.query("update damage_reports set status = 'waived', waived_reason = $1 where id = $2", [reason, d.id]);
    return out({ damage_id: d.id, status: 'waived' }, `  ${d.asset_code} damage waived: ${reason}`);
  }
  const rows = await db.query(`select * from v_damage ${flags.all ? '' : "where status = 'open'"} order by reported_on desc`);
  out(rows, () => heading(`Damage register (${rows.length}${flags.all ? '' : ' open'})`) + '\n' + table(rows, [
    { key: 'reported_on', label: 'Reported', format: isoDate },
    { key: 'days_open', label: 'Days', align: 'right' },
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 24 },
    { key: 'asset_code', label: 'Code' },
    { key: 'description', label: 'What', width: 44 },
    { key: 'est_cost_cents', label: 'Est', align: 'right', format: (v) => (v == null ? '' : money(v)) },
    { key: 'status', label: 'Status' },
  ]));
};

// ---- the money -----------------------------------------------------------------

commands.bill = async (db, args, flags) => {
  if (args[0] === 'run') {
    const targets = await db.query(
      `select distinct h.id, h.ref from hires h join v_line_charge lc on lc.hire_id = h.id
       where h.status in ('live', 'off-hired') and lc.unbilled_cents > 0 order by h.ref`);
    if (!targets.length) throw new CliError('Nothing to bill: no charge accrued anywhere.');
    const results = [];
    for (const t of targets) results.push(await billHire(db, t.id, flags));
    return out(results, () => results.map((r) => `  ${r.number}  ${r.ref.padEnd(9)} ${r.customer.padEnd(30)} ${money(r.total_cents)} (draft)`).join('\n') +
      `\n  ${results.length} draft invoice(s). Review with \`invoice <number>\`, render with \`npm run docs\`, then send them yourself and mark \`invoice sent\`.`);
  }
  const h = await resolve(db, 'hire', args[0]);
  const r = await billHire(db, h.id, flags);
  out(r, `  ${r.number} drafted for ${r.ref} (${r.customer}): ${r.lines.length} line(s), ${money(r.total_cents)}.\n  It is a DRAFT. Review it, render it with npm run docs, send it yourself, then \`invoice sent ${r.number}\`.`);
};

async function billHire(db, hireId, flags) {
  const [h] = await db.query(
    'select h.*, c.name as customer_name, c.terms_days from hires h join customers c on c.id = h.customer_id where h.id = $1', [hireId]);
  const capTo = parseDate(flags.to, 'bill-to date') || today();
  const lines = await db.query(
    `select hl.*, a.code, a.description from hire_lines hl join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and hl.on_hired_on is not null order by a.code`, [hireId]);
  const draft = [];
  for (const l of lines) {
    const on = isoDate(l.on_hired_on);
    const from = l.billed_through ? addDays(isoDate(l.billed_through), 1) : on;
    let until = l.off_hired_on ? addDays(isoDate(l.off_hired_on), -1) : capTo;
    if (until < on) until = on; // a same-day return still charges one day
    if (until > capTo) until = capTo;
    const days = daysBetween(from, until) + 1;
    if (days <= 0) continue;
    const amount = chargeCents(days, num(l.day_rate_cents), num(l.week_rate_cents));
    if (!amount) continue;
    draft.push({ line: l, from, until, days, amount, description: `${l.description} (${l.code}), ${days} day${days === 1 ? '' : 's'} ${from} to ${until}` });
  }
  const damage = await db.query(
    `select dr.*, a.code from damage_reports dr
     join hire_lines hl on hl.id = dr.hire_line_id join assets a on a.id = hl.asset_id
     where hl.hire_id = $1 and dr.status = 'charged' and dr.invoice_id is null`, [hireId]);
  if (!draft.length && !damage.length) throw new CliError(`Nothing unbilled on ${h.ref}.`);

  const number = await nextRef(db, 'invoices', 'number', 'INV', 2000);
  const total = draft.reduce((a, d) => a + d.amount, 0) + damage.reduce((a, d) => a + num(d.charged_cents), 0);
  const issued = today();
  const [inv] = await db.query(
    `insert into invoices (number, hire_id, customer_id, issued_on, due_on, total_cents, status)
     values ($1, $2, $3, $4, $5, $6, 'draft') returning id`,
    [number, hireId, h.customer_id, issued, addDays(issued, num(h.terms_days) || 20), total]);
  for (const d of draft) {
    await db.query('insert into invoice_lines (invoice_id, hire_line_id, description, amount_cents) values ($1, $2, $3, $4)',
      [inv.id, d.line.id, d.description, d.amount]);
    await db.query('update hire_lines set billed_through = $1 where id = $2', [d.until, d.line.id]);
  }
  for (const d of damage) {
    await db.query('insert into invoice_lines (invoice_id, damage_id, description, amount_cents) values ($1, $2, $3, $4)',
      [inv.id, d.id, `Damage: ${d.description} (${d.code})`, num(d.charged_cents)]);
    await db.query('update damage_reports set invoice_id = $1 where id = $2', [inv.id, d.id]);
  }
  return { number, ref: h.ref, customer: h.customer_name, total_cents: total, status: 'draft',
    lines: draft.map((d) => ({ code: d.line.code, days: d.days, amount_cents: d.amount })).concat(damage.map((d) => ({ code: d.code, damage: true, amount_cents: num(d.charged_cents) }))) };
}

commands.unbilled = async (db) => {
  const rows = await db.query("select * from v_hire_board where unbilled_cents > 0 order by unbilled_cents desc");
  out(rows, () => heading(`On the meter and not drafted (${rows.length})`) + '\n' + table(rows, [
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 28 },
    { key: 'status', label: 'Status' },
    { key: 'gear', label: 'Gear', width: 24 },
    { key: 'unbilled_cents', label: 'Accrued', align: 'right', format: (v) => money(v) },
  ]) + `\n\n  Total ${money(rows.reduce((a, r) => a + num(r.unbilled_cents), 0))}. \`bill run\` drafts the lot.`);
};

commands.invoices = async (db, args, flags) => {
  const rows = await db.query(
    `select i.number, h.ref, c.name as customer, i.issued_on, i.due_on, i.total_cents, i.status
     from invoices i join hires h on h.id = i.hire_id join customers c on c.id = i.customer_id
     ${flags.all ? '' : "where i.status <> 'paid'"} order by i.issued_on desc`);
  out(rows, () => heading(`Invoices (${rows.length}${flags.all ? '' : ' open'})`) + '\n' + table(rows, [
    { key: 'number', label: 'Number' },
    { key: 'ref', label: 'Ref' },
    { key: 'customer', label: 'Customer', width: 28 },
    { key: 'issued_on', label: 'Issued', format: isoDate },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
    { key: 'status', label: 'Status' },
  ]));
};

commands.invoice = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'sent' || sub === 'paid') {
    const inv = await resolve(db, 'invoice', args[1]);
    const onDate = parseDate(flags.on, 'date') || today();
    if (sub === 'sent') await db.query("update invoices set status = 'sent', sent_on = $1 where id = $2", [onDate, inv.id]);
    else await db.query("update invoices set status = 'paid', paid_on = $1 where id = $2", [onDate, inv.id]);
    return out({ number: inv.number, status: sub, on: onDate }, `  ${inv.number} marked ${sub} ${onDate}.`);
  }
  const inv = await resolve(db, 'invoice', args.join(' '));
  const lines = await db.query('select * from invoice_lines where invoice_id = $1 order by created_at', [inv.id]);
  out({ invoice: inv, lines }, () => {
    let t = heading(`${inv.number}  ${inv.customer_name} (${inv.status.toUpperCase()})`);
    t += `\n  hire ${inv.hire_ref} | issued ${isoDate(inv.issued_on)} | due ${isoDate(inv.due_on)}${inv.sent_on ? ` | sent ${isoDate(inv.sent_on)}` : ''}${inv.paid_on ? ` | paid ${isoDate(inv.paid_on)}` : ''}`;
    t += '\n' + table(lines, [
      { key: 'description', label: 'Line', width: 66 },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
    ]);
    t += `\n  Total ${money(inv.total_cents)}`;
    if (inv.status === 'draft') t += '\n  A DRAFT: render with npm run docs, send it yourself, then `invoice sent`.';
    return t;
  });
};

commands.debtors = async (db) => {
  const rows = await db.query('select * from v_debtors order by days_overdue desc');
  out(rows, () => heading(`Debtors (${rows.length})`) + '\n' + table(rows, [
    { key: 'number', label: 'Number' },
    { key: 'customer', label: 'Customer', width: 28 },
    { key: 'ref', label: 'Ref' },
    { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
    { key: 'status', label: 'Status' },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'bucket', label: 'Aged', format: (v, r) => (r.status === 'draft' ? 'NOT SENT' : v) },
  ]));
};

// ---- the desk ---------------------------------------------------------------------

commands.staff = async (db) => {
  const rows = await db.query('select * from staff where active order by full_name');
  out(rows, () => heading(`Staff (${rows.length})`) + '\n' + table(rows, [
    { key: 'code', label: 'Code' },
    { key: 'full_name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
  ]));
};

commands.customers = async (db, args, flags) => {
  const rows = await db.query(
    `select cp.*, c.city, c.contact_name from v_customer_position cp join customers c on c.id = cp.customer_id
     where cp.status = 'active' or $1 order by cp.exposure_cents desc, cp.customer`, [Boolean(flags.all)]);
  out(rows, () => heading(`Customers (${rows.length})`) + '\n' + table(rows, [
    { key: 'customer', label: 'Customer', width: 30, format: (v, r) => v + (r.on_stop ? ' [STOP]' : '') },
    { key: 'account_type', label: 'Type' },
    { key: 'live_hires', label: 'Live', align: 'right', format: (v) => (num(v) ? v : '') },
    { key: 'week_value_cents', label: '$/week', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'owing_cents', label: 'Owing', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'unbilled_cents', label: 'Unbilled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'exposure_cents', label: 'Exposure', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'credit_limit_cents', label: 'Limit', align: 'right', format: (v, r) => (v == null ? '' : money(v) + (num(r.exposure_cents) > num(v) ? ' OVER' : '')) },
  ]));
};

commands.customer = async (db, args) => {
  const c = await resolve(db, 'customer', args.join(' '));
  const [pos] = await db.query('select * from v_customer_position where customer_id = $1', [c.id]);
  const hires = await db.query(
    `select h.ref, h.site, h.status, h.start_on, h.off_hired_on,
            (select string_agg(a.code, ', ' order by a.code) from hire_lines hl join assets a on a.id = hl.asset_id where hl.hire_id = h.id) as gear
     from hires h where h.customer_id = $1 order by h.start_on desc limit 15`, [c.id]);
  const invs = await db.query('select * from v_debtors where customer_id = $1 order by days_overdue desc', [c.id]);
  const noteRows = await db.query(
    `select n.*, s.full_name as by_whom from notes n left join staff s on s.id = n.staff_id
     where n.customer_id = $1 order by n.noted_on desc limit 8`, [c.id]);
  const openTasks = await db.query("select * from tasks where customer_id = $1 and status = 'open' order by due_on", [c.id]);
  out({ customer: c, position: pos, hires, owing: invs, notes: noteRows, tasks: openTasks }, () => {
    let t = heading(`${c.name}${c.on_stop ? '  [ON STOP]' : ''}`);
    t += `\n  ${c.account_type} account | ${c.contact_name || ''} ${c.phone || ''} ${c.email || ''} | ${c.city || ''}`;
    t += `\n  terms ${c.terms_days} days | limit ${c.credit_limit_cents == null ? 'none set' : money(c.credit_limit_cents)} | owing ${money(pos?.owing_cents)} + unbilled ${money(pos?.unbilled_cents)} = exposure ${money(pos?.exposure_cents)}${c.credit_limit_cents != null && num(pos?.exposure_cents) > num(c.credit_limit_cents) ? ' OVER THE LIMIT' : ''}`;
    t += `\n  lifetime paid ${money(pos?.lifetime_paid_cents)} | last contact ${isoDate(pos?.last_contact_on) || 'never'}`;
    if (c.note) t += `\n  note: ${c.note}`;
    if (hires.length) t += '\n' + heading('Hires') + '\n' + table(hires, [
      { key: 'ref', label: 'Ref' },
      { key: 'status', label: 'Status' },
      { key: 'site', label: 'Site', width: 30 },
      { key: 'gear', label: 'Gear', width: 24 },
      { key: 'start_on', label: 'Start', format: isoDate },
      { key: 'off_hired_on', label: 'Off', format: isoDate },
    ]);
    if (invs.length) t += '\n' + heading('Owing') + '\n' + table(invs, [
      { key: 'number', label: 'Number' },
      { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status' },
      { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'bucket', label: 'Aged', format: (v, r) => (r.status === 'draft' ? 'NOT SENT' : v) },
    ]);
    if (noteRows.length) t += '\n' + heading('Notes') + '\n' + table(noteRows, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'channel', label: 'Via' },
      { key: 'by_whom', label: 'Who' },
      { key: 'note', label: 'Note', width: 64 },
    ]);
    if (openTasks.length) t += '\n' + heading('Open tasks') + '\n' + table(openTasks, [
      { key: 'title', label: 'Task', width: 50 },
      { key: 'due_on', label: 'Due', format: isoDate },
    ]);
    return t;
  });
};

commands.add = async (db, args, flags) => {
  const kind = args[0];
  if (kind === 'customer') {
    const name = args[1];
    if (!name) throw new CliError('add customer "<name>" [--type=trade|consumer] [--contact=] [--email=] [--phone=] [--city=] [--terms=20] [--limit=]');
    const type = str(flags.type) || 'trade';
    if (!['trade', 'consumer'].includes(type)) throw new CliError('--type is trade or consumer. It decides whether the CGA can be excluded, so it matters.');
    const [r] = await db.query(
      `insert into customers (name, account_type, contact_name, email, phone, city, terms_days, credit_limit_cents)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [name, type, str(flags.contact) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.city) || null,
       flags.terms !== undefined ? Number(flags.terms) : 20, flags.limit !== undefined ? parseMoney(flags.limit) : null]);
    return out({ customer_id: r.id, name }, `  customer added: ${name} (${type}).`);
  }
  if (kind === 'staff') {
    const name = args[1];
    if (!name) throw new CliError('add staff "<name>" [--role=hire desk|driver|mechanic|manager] [--code=] [--email=] [--phone=]');
    const [r] = await db.query('insert into staff (full_name, role, code, email, phone) values ($1, $2, $3, $4, $5) returning id',
      [name, str(flags.role) || 'hire desk', str(flags.code) || null, str(flags.email) || null, str(flags.phone) || null]);
    return out({ staff_id: r.id, name }, `  staff added: ${name}.`);
  }
  if (kind === 'asset') {
    const code = args[1];
    const desc = args[2];
    if (!code || !desc) throw new CliError('add asset <code> "<description>" --category= --day= --week= [--make= --model= --serial= --meter= --interval-hours= --interval-months= --electrical --inspection=mewp-6-monthly|crane-annual]');
    const [r] = await db.query(
      `insert into assets (code, description, category, make, model, serial, day_rate_cents, week_rate_cents, meter_hours,
                           service_interval_hours, service_interval_months, electrical, inspection_kind)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [code, desc, str(flags.category) || 'general', str(flags.make) || null, str(flags.model) || null, str(flags.serial) || null,
       parseMoney(flags.day), parseMoney(flags.week), flags.meter !== undefined ? Number(flags.meter) : null,
       flags['interval-hours'] !== undefined ? Number(flags['interval-hours']) : null,
       flags['interval-months'] !== undefined ? Number(flags['interval-months']) : null,
       flags.electrical !== undefined, str(flags.inspection) || null]);
    return out({ asset_id: r.id, code }, `  asset added: ${code} ${desc}. If it is electrical it needs a tag before it goes out; if it is a MEWP or crane, record the inspection.`);
  }
  throw new CliError('add customer|staff|asset ...');
};

commands.stop = async (db, args, flags) => {
  const c = await resolve(db, 'customer', args.join(' '));
  await db.query('update customers set on_stop = true where id = $1', [c.id]);
  await db.query('insert into notes (customer_id, noted_on, channel, note) values ($1, current_date, $2, $3)',
    [c.id, 'phone', `Account put ON STOP.${flags.note ? ' ' + str(flags.note) : ''}`]);
  out({ customer: c.name, on_stop: true }, `  ${c.name} is ON STOP. New bookings refuse; \`attention\` watches anything still out.`);
};

commands.unstop = async (db, args) => {
  const c = await resolve(db, 'customer', args.join(' '));
  await db.query('update customers set on_stop = false where id = $1', [c.id]);
  out({ customer: c.name, on_stop: false }, `  ${c.name} is trading again.`);
};

commands.log = async (db, args, flags) => {
  const target = args[0];
  const note = args[1];
  if (!target || !note) throw new CliError('log <ref|customer> "what happened" [--channel=phone|email|yard|site|workshop] [--by=] [--on=]');
  const by = flags.by ? await resolve(db, 'staff', str(flags.by)) : null;
  const onDate = parseDate(flags.on, 'note date') || today();
  const channel = str(flags.channel) || 'phone';
  const h = await resolve(db, 'hire', target, { optional: true });
  if (h) {
    await db.query('insert into notes (customer_id, hire_id, staff_id, noted_on, channel, note) values ($1, $2, $3, $4, $5, $6)',
      [h.customer_id, h.id, by?.id || null, onDate, channel, note]);
    return out({ ref: h.ref, noted_on: onDate }, `  noted on ${h.ref} (${h.customer_name}).`);
  }
  const c = await resolve(db, 'customer', target);
  await db.query('insert into notes (customer_id, staff_id, noted_on, channel, note) values ($1, $2, $3, $4, $5)',
    [c.id, by?.id || null, onDate, channel, note]);
  out({ customer: c.name, noted_on: onDate }, `  noted on ${c.name}.`);
};

commands.tasks = async (db, args, flags) => {
  const rows = await db.query(
    `select t.*, c.name as customer, h.ref from tasks t
     left join customers c on c.id = t.customer_id left join hires h on h.id = t.hire_id
     ${flags.all ? '' : "where t.status = 'open'"} order by t.due_on nulls last`);
  out(rows, () => heading(`Tasks (${rows.length}${flags.all ? '' : ' open'})`) + '\n' + table(rows, [
    { key: 'title', label: 'Task', width: 52 },
    { key: 'customer', label: 'Customer', width: 24 },
    { key: 'ref', label: 'Ref' },
    { key: 'due_on', label: 'Due', format: (v) => (v ? isoDate(v) + (isoDate(v) < today() ? ' OVERDUE' : '') : '') },
    { key: 'status', label: 'Status' },
  ]));
};

commands.task = async (db, args, flags) => {
  const sub = args[0];
  if (sub === 'add') {
    const title = args[1];
    if (!title) throw new CliError('task add "<title>" [--customer=] [--hire=] [--due=] [--by=] [--note=]');
    const c = flags.customer ? await resolve(db, 'customer', str(flags.customer)) : null;
    const h = flags.hire ? await resolve(db, 'hire', str(flags.hire)) : null;
    const by = flags.by ? await resolve(db, 'staff', str(flags.by)) : null;
    await db.query('insert into tasks (title, customer_id, hire_id, staff_id, due_on, note) values ($1, $2, $3, $4, $5, $6)',
      [title, c?.id || h?.customer_id || null, h?.id || null, by?.id || null, parseDate(flags.due, 'due date'), str(flags.note) || null]);
    return out({ title }, `  task added: ${title}`);
  }
  if (sub === 'done') {
    const t = await resolve(db, 'task', args.slice(1).join(' '));
    const onDate = parseDate(flags.on, 'done date') || today();
    await db.query("update tasks set status = 'done', done_on = $1 where id = $2", [onDate, t.id]);
    return out({ task: t.title, done_on: onDate }, `  done: ${t.title}`);
  }
  throw new CliError('task add|done ...');
};

// ---- attention, compliance, stats ------------------------------------------------

const ATTENTION_ORDER = [
  'cert_expired_on_hire', 'service_overdue_on_hire', 'no_pre_hire_check', 'on_stop_live', 'cga_excluded_consumer',
  'off_hire_overdue', 'pickup_waiting', 'ppsr_missing', 'contract_unsigned', 'over_credit_limit',
  'unbilled_finished', 'invoice_overdue', 'invoice_draft', 'damage_open',
  'blocked_in_yard', 'workshop_long', 'dead_fleet', 'task_overdue',
];
const ATTENTION_LABEL = {
  cert_expired_on_hire: 'CERT EXPIRED, ON HIRE', service_overdue_on_hire: 'Service overdue, on hire',
  no_pre_hire_check: 'No pre-hire check', on_stop_live: 'On stop, gear still out',
  cga_excluded_consumer: 'CGA excluded vs a consumer', off_hire_overdue: 'Running past expected end',
  pickup_waiting: 'Awaiting pickup', ppsr_missing: 'No PPSR, closing on a year',
  contract_unsigned: 'Live with no signed contract', over_credit_limit: 'Over the credit limit',
  unbilled_finished: 'Finished, not billed', invoice_overdue: 'Invoice overdue', invoice_draft: 'Draft never sent',
  damage_open: 'Damage uncharged', blocked_in_yard: 'In the yard, cannot go out',
  workshop_long: 'Stuck in the workshop', dead_fleet: 'Dead fleet', task_overdue: 'Task overdue',
};

commands.attention = async (db) => {
  const rows = await db.query('select * from v_attention');
  rows.sort((a, b) => ATTENTION_ORDER.indexOf(a.reason) - ATTENTION_ORDER.indexOf(b.reason) || num(b.days) - num(a.days));
  out(rows, () => {
    const counts = {};
    for (const r of rows) counts[r.reason] = (counts[r.reason] || 0) + 1;
    let t = heading(`Needs attention (${rows.length})`);
    t += '\n  ' + Object.entries(counts).map(([k, n]) => `${ATTENTION_LABEL[k] || k}: ${n}`).join('  |  ');
    t += '\n\n' + table(rows, [
      { key: 'reason', label: 'What', format: (v) => ATTENTION_LABEL[v] || v },
      { key: 'label', label: 'Record', width: 18 },
      { key: 'customer', label: 'Customer', width: 24 },
      { key: 'asset', label: 'Code' },
      { key: 'days', label: 'Days', align: 'right' },
      { key: 'amount_cents', label: 'Value', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'detail', label: 'Detail', width: 62 },
    ]);
    return t;
  });
};

commands.compliance = async (db, args) => {
  const only = args[0];
  const rules = only ? RULES.filter((r) => r.key === only || r.key.startsWith(only)) : RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${RULES.map((r) => r.key).join(', ')}`);
  const results = [];
  for (const r of rules) {
    const breaches = await db.query(r.sql);
    results.push({ key: r.key, title: r.title, source: r.source, fix: r.fix, breaches });
  }
  out(results, () => {
    let t = heading('Compliance, checked against the records');
    for (const r of results) {
      t += `\n\n  ${r.breaches.length ? 'BREACH' : '  ok  '}  ${r.key}: ${r.title}`;
      t += `\n          ${r.source}`;
      if (r.breaches.length) {
        for (const b of r.breaches) {
          t += `\n          - ${Object.values(b).filter((v) => v !== null && v !== '').map((v) => (v instanceof Date ? isoDate(v) : v)).join(' | ')}`;
        }
        t += `\n          fix: ${r.fix}`;
      }
    }
    t += '\n\n  The rule book with sources is docs/compliance.md. It is your rule book, not legal advice: edit it and these checks together.';
    return t;
  });
};

commands.stats = async (db) => {
  const [c] = await db.query(`
    select (select count(*) from assets where status <> 'off-fleet') as fleet,
           (select count(*) from v_fleet where on_hire) as on_hire,
           (select count(*) from assets where status = 'workshop') as workshop,
           (select count(*) from hires where status = 'live') as live_hires,
           (select count(*) from hires where status = 'booked') as booked,
           (select count(*) from v_off_hire_queue) as off_hire_queue,
           (select coalesce(sum(week_value_cents), 0) from v_hire_board where status = 'live') as week_value_cents,
           (select coalesce(sum(unbilled_cents), 0) from v_hire_board) as unbilled_cents,
           (select coalesce(sum(total_cents), 0) from v_debtors where status = 'sent') as owing_cents,
           (select count(*) from v_attention) as attention
  `);
  const stats = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
  out(stats, () => heading('The yard') + `
  fleet ${stats.fleet} machines | ${stats.on_hire} on hire | ${stats.workshop} in the workshop
  contracts: ${stats.live_hires} live, ${stats.booked} booked, ${stats.off_hire_queue} in the off-hire queue
  money: ${money(stats.week_value_cents)}/week on hire | ${money(stats.unbilled_cents)} accrued unbilled | ${money(stats.owing_cents)} owed
  attention items: ${stats.attention}`);
};

// ---- import / export --------------------------------------------------------------

function readCsvFile(file, what) {
  if (!file || file === true) return null;
  const p = path.resolve(String(file));
  if (!existsSync(p)) throw new CliError(`No ${what} file at ${p}.`);
  return parseCsv(readFileSync(p, 'utf8'));
}

commands.import = async (db, args, flags) => {
  const source = args[0] || 'csv';
  if (!['baseplan', 'csv'].includes(source)) throw new CliError('import baseplan|csv --customers= --assets= --hires= [--dry-run]');
  const dry = Boolean(flags['dry-run']);
  const customersCsv = readCsvFile(flags.customers, 'customers');
  const assetsCsv = readCsvFile(flags.assets, 'assets');
  const hiresCsv = readCsvFile(flags.hires, 'hires');
  if (!customersCsv && !assetsCsv && !hiresCsv) throw new CliError('Give at least one of --customers=, --assets=, --hires= (CSV exports; see docs/replace-baseplan.md).');

  const counts = { customers: 0, customers_updated: 0, assets: 0, assets_updated: 0, hires: 0, hires_updated: 0, lines: 0, skipped: [] };
  // What this run would create, so a --dry-run can count hire rows whose
  // customer or asset arrives in the same import.
  const seenCustomers = new Set();
  const seenAssets = new Set();
  const seenContracts = new Set();

  if (customersCsv) {
    for (const row of customersCsv) {
      const name = pick(row, 'Customer Name', 'Name', 'Customer');
      if (!name) { counts.skipped.push('customer row with no name'); continue; }
      const code = pick(row, 'Customer Code', 'Code', 'Account Code');
      seenCustomers.add(name.toLowerCase());
      if (code) seenCustomers.add(code.toLowerCase());
      const existing = await db.query('select id from customers where lower(name) = lower($1) or (coalesce($2, \'\') <> \'\' and lower(coalesce(code, \'\')) = lower($2))', [name, code || '']);
      const fields = [pick(row, 'Contact', 'Contact Name'), pick(row, 'Email'), pick(row, 'Phone', 'Phone No'), pick(row, 'City', 'Town', 'Suburb')];
      if (existing.length) {
        counts.customers_updated++;
        if (!dry) await db.query(
          `update customers set code = coalesce(nullif($2, ''), code), contact_name = coalesce(nullif($3, ''), contact_name),
             email = coalesce(nullif($4, ''), email), phone = coalesce(nullif($5, ''), phone), city = coalesce(nullif($6, ''), city)
           where id = $1`, [existing[0].id, code, ...fields]);
      } else {
        counts.customers++;
        if (!dry) await db.query(
          `insert into customers (name, code, contact_name, email, phone, city, terms_days)
           values ($1, nullif($2, ''), nullif($3, ''), nullif($4, ''), nullif($5, ''), nullif($6, ''), $7)`,
          [name, code, ...fields, Number(pick(row, 'Payment Terms', 'Terms')) || 20]);
      }
    }
  }

  if (assetsCsv) {
    for (const row of assetsCsv) {
      const code = pick(row, 'Fleet No', 'Asset Code', 'Plant No', 'Code');
      const desc = pick(row, 'Description', 'Asset Description');
      if (!code || !desc) { counts.skipped.push(`asset row missing Fleet No or Description (${code || desc || 'blank'})`); continue; }
      seenAssets.add(code.toLowerCase());
      const existing = await db.query('select id from assets where lower(code) = lower($1)', [code]);
      const vals = [
        pick(row, 'Category', 'Group', 'Rate Group') || 'general',
        pick(row, 'Make'), pick(row, 'Model'), pick(row, 'Serial No', 'Serial'),
        Math.round(Number(pick(row, 'Day Rate', 'Daily Rate') || 0) * 100),
        Math.round(Number(pick(row, 'Week Rate', 'Weekly Rate') || 0) * 100),
      ];
      if (existing.length) {
        counts.assets_updated++;
        if (!dry) await db.query(
          `update assets set category = $2, make = nullif($3, ''), model = nullif($4, ''), serial = nullif($5, ''),
             day_rate_cents = case when $6 > 0 then $6 else day_rate_cents end,
             week_rate_cents = case when $7 > 0 then $7 else week_rate_cents end
           where id = $1`, [existing[0].id, ...vals]);
      } else {
        counts.assets++;
        if (!dry) await db.query(
          `insert into assets (code, description, category, make, model, serial, day_rate_cents, week_rate_cents, purchased_on)
           values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), $7, $8, $9)`,
          [code, desc, vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], parseDate(pick(row, 'Purchase Date') || null, 'purchase date')]);
      }
    }
  }

  if (hiresCsv) {
    for (const row of hiresCsv) {
      const contractNo = pick(row, 'Contract No', 'Contract', 'Hire No');
      const custName = pick(row, 'Customer', 'Customer Name', 'Customer Code');
      const fleetNo = pick(row, 'Fleet No', 'Asset Code', 'Plant No');
      if (!contractNo || !custName || !fleetNo) { counts.skipped.push(`hire row missing Contract No, Customer or Fleet No (${contractNo || 'blank'})`); continue; }
      const cust = await db.query('select id from customers where lower(name) = lower($1) or lower(coalesce(code, \'\')) = lower($1)', [custName]);
      if (!cust.length && !seenCustomers.has(custName.toLowerCase())) { counts.skipped.push(`${contractNo}: customer "${custName}" not found (import customers first)`); continue; }
      const asset = await db.query('select * from assets where lower(code) = lower($1)', [fleetNo]);
      if (!asset.length && !seenAssets.has(fleetNo.toLowerCase())) { counts.skipped.push(`${contractNo}: asset "${fleetNo}" not found (import assets first)`); continue; }
      const dateOut = parseDate(pick(row, 'Date Out', 'Start Date', 'On Hire Date') || null, 'date out');
      const dateIn = parseDate(pick(row, 'Date In', 'Off Hire Date', 'End Date') || null, 'date in');
      if (!dateOut) { counts.skipped.push(`${contractNo}: no Date Out`); continue; }
      const hires = await db.query('select * from hires where external_ref = $1', [`import:${contractNo}`]);
      let hireId = hires.length ? hires[0].id : null;
      if (hires.length) {
        counts.hires_updated++;
      } else if (!seenContracts.has(contractNo)) {
        counts.hires++;
        seenContracts.add(contractNo);
        if (!dry) {
          const ref = await nextRef(db, 'hires', 'ref', 'HC', 1000);
          const status = dateIn ? 'closed' : 'live';
          const [h] = await db.query(
            `insert into hires (ref, customer_id, site, status, start_on, off_hired_on, closed_on, external_ref)
             values ($1, $2, $3, $4, $5, $6, $6, $7) returning id`,
            [ref, cust[0].id, pick(row, 'Site', 'Delivery Address') || 'imported', status, dateOut, dateIn, `import:${contractNo}`]);
          hireId = h.id;
        }
      }
      if (dry) {
        counts.lines++;
      } else if (hireId) {
        const line = await db.query('select id from hire_lines where hire_id = $1 and asset_id = $2', [hireId, asset[0].id]);
        if (!line.length) {
          counts.lines++;
          const day = Math.round(Number(pick(row, 'Day Rate', 'Daily Rate') || 0) * 100) || num(asset[0].day_rate_cents);
          const week = Math.round(Number(pick(row, 'Week Rate', 'Weekly Rate') || 0) * 100) || num(asset[0].week_rate_cents);
          // History arrives already billed: the old system invoiced it. Open
          // lines start billing here from tomorrow.
          await db.query(
            `insert into hire_lines (hire_id, asset_id, day_rate_cents, week_rate_cents, on_hired_on, off_hired_on, picked_up_on, billed_through)
             values ($1, $2, $3, $4, $5, $6, $6, $7)`,
            [hireId, asset[0].id, day, week, dateOut, dateIn, dateIn ? addDays(dateIn, -1) : today()]);
        }
      }
    }
  }

  out({ dry_run: dry, ...counts }, () => {
    let t = `  ${dry ? 'DRY RUN, nothing written' : 'imported'}: ` +
      `${counts.customers} customers (+${counts.customers_updated} updated), ` +
      `${counts.assets} assets (+${counts.assets_updated} updated), ` +
      `${counts.hires} hires (+${counts.hires_updated} updated), ${counts.lines} lines.`;
    if (counts.skipped.length) t += `\n  skipped:\n    ${counts.skipped.join('\n    ')}`;
    t += '\n  Certificates, meters and open damage do NOT import: walk the yard once and record them (docs/replace-baseplan.md says why).';
    return t;
  });
};

commands.export = async (db, args, flags) => {
  const tables = ['staff', 'customers', 'assets', 'hires', 'hire_lines', 'deliveries', 'services', 'damage_reports', 'invoices', 'invoice_lines', 'notes', 'tasks'];
  const dump = {};
  const counts = {};
  for (const t of tables) {
    dump[t] = await db.query(`select * from ${t} order by created_at`);
    counts[t] = dump[t].length;
  }
  const file = path.resolve(str(flags.out) || path.join(REPO_ROOT, 'exports', `hire-export-${today()}.json`));
  writeFileSync(file, JSON.stringify(dump, (k, v) => (v instanceof Date ? isoDate(v) : v), 2));
  out({ file, counts }, `  exported ${Object.values(counts).reduce((a, b) => a + b, 0)} rows to ${file}`);
};

// ---------------------------------------------------------------------------
// Main

const { args: ARGS, flags: FLAGS } = parseArgv(process.argv.slice(2));
JSON_MODE = Boolean(FLAGS.json);
const cmd = ARGS[0] || 'help';

const db = cmd === 'help' ? null : await getDb();
try {
  const fn = commands[cmd];
  if (!fn) {
    console.error(`[hire] unknown command "${cmd}". Run \`node scripts/hire.mjs help\`.`);
    process.exit(1);
  }
  await fn(db, ARGS.slice(1), FLAGS);
} catch (e) {
  if (e instanceof CliError) {
    console.error(`[hire] ${e.message}`);
    process.exit(e.code);
  }
  throw e;
} finally {
  if (db) await db.close();
}
