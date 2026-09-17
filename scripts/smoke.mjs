#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'hire-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (v) => String(v ?? '').slice(0, 10);

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is a day ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the yard --------------------------------------------------------------

  const fleet = run('fleet', ['hire.mjs', 'fleet']);
  assert(fleet.length === 20, `twenty machines (${fleet.length})`);
  assert(fleet.filter((f) => f.on_hire).length === 8, `eight on hire (${fleet.filter((f) => f.on_hire).length})`);
  assert(fleet.some((f) => f.service_overdue && f.on_hire), 'the overdue roller shows, on hire');
  assert(fleet.some((f) => f.tag_due && f.on_hire), 'so does the expired tag on hire');
  assert(fleet.some((f) => f.inspection_expired && f.on_hire), 'and the lapsed MEWP inspection');

  const asset = run('asset card', ['hire.mjs', 'asset', 'SL-201']);
  assert(asset.asset.code === 'SL-201', 'resolved by code');
  assert(asset.position.inspection_expired === true, 'the card knows the inspection lapsed');
  assert(asset.hires.length >= 1 && asset.hires[0].customer === 'Harbourline Civil Ltd', 'and who has it');

  const byName = run('asset by partial name', ['hire.mjs', 'asset', 'hitachi']);
  assert(byName.asset.code === 'EX-102', 'the Hitachi resolves to EX-102');

  const noSuch = run('an unknown asset exits 1', ['hire.mjs', 'asset', 'no such machine'], { json: false, expectFail: true });
  assert(/No asset matches/.test(noSuch.stderr), 'and says so plainly');

  const ambiguous = run('an ambiguous match exits 1 and lists candidates', ['hire.mjs', 'asset', 'Genie'], { json: false, expectFail: true });
  assert(/matches \d+ asset records/.test(ambiguous.stderr), 'with the candidates listed');

  const avail = run('availability', ['hire.mjs', 'availability']);
  const blocked = avail.filter((a) => a.blocked);
  assert(avail.length === 12, `twelve machines in the yard (${avail.length})`);
  assert(blocked.length === 2, `two of them blocked (${blocked.length})`);
  assert(blocked.some((b) => b.code === 'GN-403' && /tag/.test(b.blocked_reason)), 'the untagged generator cannot go out');
  assert(avail.some((a) => a.code === 'GN-402' && a.next_booked_on), 'the booked generator shows its booking');

  const util = run('utilisation', ['hire.mjs', 'utilisation']);
  const exc = util.find((u) => u.category === 'excavator');
  assert(exc && n(exc.fleet) === 3 && n(exc.on_hire) === 2, 'excavators: three in fleet, two out');
  assert(util.some((u) => n(u.idle_90d) > 0), 'and the dead fleet shows in the idle column');

  // ---- contracts --------------------------------------------------------------

  const board = run('board', ['hire.mjs', 'board']);
  assert(board.length === 10, `ten open contracts (${board.length})`);
  assert(board.some((b) => n(b.days_over) === 9), 'the over-running subdivision shows 9 days over');
  assert(board.some((b) => b.on_stop && b.status === 'live'), 'the stopped account with gear out shows');

  const hire = run('hire card', ['hire.mjs', 'hire', 'HC-1003']);
  assert(hire.hire.customer_name === 'Harbourline Civil Ltd', 'resolved by ref');
  assert(hire.lines.length === 2, 'two machines on it');
  assert(hire.lines.reduce((a, l) => a + n(l.unbilled_cents), 0) === 296000, 'with $2,960 on the meter');
  assert(hire.invoices.length === 1 && hire.invoices[0].status === 'sent', 'and the sent invoice attached');

  const offhires = run('off-hires', ['hire.mjs', 'off-hires']);
  assert(offhires.length === 3, `three in the off-hire queue (${offhires.length})`);
  assert(offhires.filter((o) => o.reason === 'running past expected end').length === 2, 'two lines over-running');
  assert(offhires.some((o) => o.reason === 'off hire, awaiting pickup' && o.asset_code === 'FK-701'), 'the forklift awaits pickup');

  const runsheet = run('runsheet', ['hire.mjs', 'runsheet']);
  assert(runsheet.length === 1 && runsheet[0].kind === 'pickup', 'one pickup on today\'s runsheet');

  // ---- the workshop, damage, money ---------------------------------------------

  const service = run('service', ['hire.mjs', 'service']);
  assert(service.jobs.length === 4, `four open workshop jobs (${service.jobs.length})`);
  assert(service.clocks.length === 4, `four clocks running down (${service.clocks.length})`);

  const damage = run('damage', ['hire.mjs', 'damage']);
  assert(damage.length === 1 && damage[0].asset_code === 'FK-701', 'one open damage report, the forklift');

  const unbilled = run('unbilled', ['hire.mjs', 'unbilled']);
  const unbilledTotal = unbilled.reduce((a, r) => a + n(r.unbilled_cents), 0);
  assert(unbilledTotal === 1044500, `the meter agrees to the cent ($10,445 = ${unbilledTotal})`);

  const debtors = run('debtors', ['hire.mjs', 'debtors']);
  assert(debtors.some((d) => d.status === 'sent' && n(d.days_overdue) === 45), 'the 45 day overdue invoice shows');
  assert(debtors.some((d) => d.status === 'draft'), 'so does the draft that never went out');

  const customers = run('customers', ['hire.mjs', 'customers']);
  assert(customers.length === 14, `fourteen customers (${customers.length})`);
  const harbourline = customers.find((c) => c.customer === 'Harbourline Civil Ltd');
  assert(n(harbourline.exposure_cents) === 666000 && n(harbourline.exposure_cents) > n(harbourline.credit_limit_cents), 'Harbourline is over its limit');

  const custCard = run('customer card', ['hire.mjs', 'customer', 'Coastal']);
  assert(custCard.customer.name === 'Coastal Scaffolding Ltd', 'resolved by partial name');
  assert(custCard.hires.length === 1, 'with its hire');

  // ---- attention and compliance ---------------------------------------------------

  const attention = run('attention', ['hire.mjs', 'attention']);
  assert(attention.length === 23, `the attention list is loud (${attention.length})`);
  for (const reason of ['cert_expired_on_hire', 'service_overdue_on_hire', 'no_pre_hire_check', 'on_stop_live',
    'cga_excluded_consumer', 'off_hire_overdue', 'pickup_waiting', 'ppsr_missing', 'contract_unsigned',
    'over_credit_limit', 'unbilled_finished', 'invoice_overdue', 'invoice_draft', 'damage_open',
    'blocked_in_yard', 'workshop_long', 'dead_fleet', 'task_overdue']) {
    assert(attention.some((a) => a.reason === reason), `attention carries ${reason}`);
  }
  assert(attention.filter((a) => a.reason === 'dead_fleet').length === 2, 'dead fleet is exactly the deliberate two');

  const compliance = run('compliance', ['hire.mjs', 'compliance']);
  assert(compliance.length === 6, 'six rules in the book');
  assert(compliance.every((r) => r.breaches.length > 0), 'every rule breached in the seed, deliberately');
  const oneRule = run('one compliance rule', ['hire.mjs', 'compliance', 'ppsr']);
  assert(oneRule.length === 1 && oneRule[0].breaches.length === 1, 'run one rule on its own');

  run('stats', ['hire.mjs', 'stats']);

  // ---- a hire, end to end -----------------------------------------------------------

  run('add a customer', ['hire.mjs', 'add', 'customer', 'Totally Solid Builders Ltd', '--type=trade', '--contact=Ari Vercoe', '--limit=8000']);

  const stopped = run('booking a stopped account is refused', ['hire.mjs', 'hire', 'book', 'Tasman', '--site=Test yard', '--assets=TR-981'], { json: false, expectFail: true });
  assert(/ON STOP/.test(stopped.stderr), 'and the refusal names the stop');

  const clash = run('booking a machine already out is refused', ['hire.mjs', 'hire', 'book', 'Totally Solid', '--site=Test', '--assets=EX-102'], { json: false, expectFail: true });
  assert(/already committed/.test(clash.stderr), 'with the contract it sits on');

  const start9 = addDays(todayIso, -9);
  const booked = run('book a hire', ['hire.mjs', 'hire', 'book', 'Totally Solid', '--site=14 Matai St driveway dig', `--start=${start9}`, '--assets=EX-103,TR-981', '--by=Kelly', '--po=TSB-01']);
  const ref = booked.ref;
  assert(/^HC-\d+$/.test(ref), `the contract ref is minted (${ref})`);

  const unchecked = run('starting unchecked gear is refused', ['hire.mjs', 'hire', 'start', ref, `--on=${start9}`], { json: false, expectFail: true });
  assert(/pre-hire check/.test(unchecked.stderr) && /AS\/NZS 3760/.test(unchecked.stderr), 'and the refusal cites the standard');

  run('record the pre-hire checks', ['hire.mjs', 'check', ref, 'all', '--by=Denny', `--on=${start9}`]);
  run('now it starts', ['hire.mjs', 'hire', 'start', ref, `--on=${start9}`]);

  const blockedBook = run('book the untagged generator', ['hire.mjs', 'hire', 'book', 'Totally Solid', '--site=Same job', '--assets=GN-403']);
  run('check it', ['hire.mjs', 'check', blockedBook.ref, 'all', '--by=Denny']);
  const blockedStart = run('starting gear with no tag is refused', ['hire.mjs', 'hire', 'start', blockedBook.ref], { json: false, expectFail: true });
  assert(/test tag/.test(blockedStart.stderr), 'the tag block holds even after a check');
  run('cancel that booking', ['hire.mjs', 'hire', 'cancel', blockedBook.ref]);

  const billed = run('bill the hire', ['hire.mjs', 'bill', ref]);
  assert(/^INV-\d+$/.test(billed.number), `an invoice is minted (${billed.number})`);
  // 10 days: EX-103 one week ($720) + 3 days capped ($540) = $1,260; trailer $140 + $105 = $245.
  assert(n(billed.total_cents) === 150500, `the charge computes off the captured rates (${billed.total_cents})`);
  assert(billed.status === 'draft', 'and it is a DRAFT');

  const emptyBill = run('billing again finds nothing', ['hire.mjs', 'bill', ref], { json: false, expectFail: true });
  assert(/Nothing unbilled/.test(emptyBill.stderr), 'the meter moved onto the invoice');

  run('off-hire it', ['hire.mjs', 'off-hire', ref]);
  run('pick it up', ['hire.mjs', 'pickup', ref]);
  run('the return check finds damage', ['hire.mjs', 'damage', 'add', ref, 'EX-103', 'Cracked door glass', '--cost=260']);

  const blockedClose = run('closing over open damage is refused', ['hire.mjs', 'hire', 'close', ref], { json: false, expectFail: true });
  assert(/damage/.test(blockedClose.stderr), 'damage gets decided before the file closes');

  run('charge the damage', ['hire.mjs', 'damage', 'charge', 'door glass']);
  const damageBill = run('bill the damage', ['hire.mjs', 'bill', ref]);
  assert(n(damageBill.total_cents) === 26000, 'the damage rides out on its own invoice');

  run('close the hire', ['hire.mjs', 'hire', 'close', ref]);
  const closedCard = run('the closed hire reads back', ['hire.mjs', 'hire', ref]);
  assert(closedCard.hire.status === 'closed', 'status says so');
  assert(closedCard.invoices.length === 2, 'with both invoices attached');

  run('invoice sent', ['hire.mjs', 'invoice', 'sent', billed.number]);
  run('invoice paid', ['hire.mjs', 'invoice', 'paid', billed.number]);

  // ---- the runsheet and the yard move on ----------------------------------------------

  run('the forklift pickup happens', ['hire.mjs', 'delivery', 'done', 'HC-1007']);
  run('the forklift is back in the yard', ['hire.mjs', 'pickup', 'HC-1007']);

  const meterBack = run('meters do not run backwards', ['hire.mjs', 'meter', 'EX-103', '1700'], { json: false, expectFail: true });
  assert(/backwards/.test(meterBack.stderr), 'and the refusal says why');
  run('a new meter reading', ['hire.mjs', 'meter', 'EX-103', '1815']);

  run('book a service', ['hire.mjs', 'service', 'book', 'EX-103', '--kind=scheduled', '--note=Smoke test service']);
  run('into the workshop', ['hire.mjs', 'service', 'start', 'Smoke test service']);
  run('service done, clock reset', ['hire.mjs', 'service', 'done', 'Smoke test service', '--cost=400', '--meter=1815']);
  const ex103 = run('the machine is back in fleet', ['hire.mjs', 'asset', 'EX-103']);
  assert(ex103.asset.status === 'in-fleet' && n(ex103.asset.last_service_hours) === 1815, 'with its service baseline moved');

  // ---- fix the compliance story, watch the book improve ----------------------------------

  const cgaRefused = run('excluding the CGA against a consumer is refused', ['hire.mjs', 'contract', 'HC-1006', '--exclude-cga'], { json: false, expectFail: true });
  assert(/consumer/.test(cgaRefused.stderr) && /s 43/.test(cgaRefused.stderr), 'and cites s 43');

  run('tag the generator on hire', ['hire.mjs', 'tag', 'GN-401', '--tested=today']);
  run('tag the yard generator', ['hire.mjs', 'tag', 'GN-403', '--tested=today']);
  run('register the PPSR on the year-long hire', ['hire.mjs', 'ppsr', 'HC-1001', '--registered=today']);
  run('sign and fix the consumer contract', ['hire.mjs', 'contract', 'HC-1006', '--signed=today', '--include-cga']);
  run('backfill the missing pre-hire check', ['hire.mjs', 'check', 'HC-1006', 'all', '--by=Kelly', `--on=${addDays(todayIso, -5)}`]);
  run('the roller service gets done', ['hire.mjs', 'service', 'done', 'RL-801', '--cost=450', '--meter=1560']);
  run('the scissor lift passes its inspection', ['hire.mjs', 'inspection', 'SL-201', `--expires=${addDays(todayIso, 180)}`]);

  const complianceAfter = run('the compliance book comes clean', ['hire.mjs', 'compliance']);
  const failing = complianceAfter.filter((r) => r.breaches.length).map((r) => r.key);
  assert(failing.length === 0, `every rule now passes (still failing: ${failing.join(',') || 'none'})`);

  // ---- import --------------------------------------------------------------------------

  const customersCsv = path.join(dataDir, 'customers.csv');
  const assetsCsv = path.join(dataDir, 'assets.csv');
  const hiresCsv = path.join(dataDir, 'hires.csv');
  writeFileSync(customersCsv, [
    'Customer Code,Customer Name,Contact,Email,Phone,City,Payment Terms',
    'KOW001,"Kowhai Builders Ltd",Tim Rapana,tim@kowhai.example.nz,07 555 0301,Tauranga,20',
    'PAP001,"Papamoa Hire & Haul",Jo Craddock,jo@paphaul.example.nz,07 555 0302,Papamoa,14',
    'BAY001,"BayBuild Construction Ltd",Rob Neilson,accounts@baybuild.example.nz,07 555 0201,Tauranga,20',
  ].join('\n'));
  writeFileSync(assetsCsv, [
    'Fleet No,Description,Category,Make,Model,Serial No,Day Rate,Week Rate',
    'TL-100,"Makita tile saw",saw,Makita,4101RH,MK41-1002,45,180',
    'EX-101,"Kubota U17-3 1.7t excavator",excavator,Kubota,U17-3,KX17-44821,180,720',
  ].join('\n'));
  writeFileSync(hiresCsv, [
    'Contract No,Customer,Fleet No,Site,Date Out,Date In,Day Rate,Week Rate',
    `C-9001,"Kowhai Builders Ltd",TL-100,"12 Kowhai St",${addDays(todayIso, -6)},,45,180`,
    `C-9002,"Papamoa Hire & Haul",EX-101,"Papamoa depot",${addDays(todayIso, -60)},${addDays(todayIso, -50)},180,720`,
  ].join('\n'));

  const dry = run('import dry run writes nothing', ['hire.mjs', 'import', 'baseplan', `--customers=${customersCsv}`, `--assets=${assetsCsv}`, `--hires=${hiresCsv}`, '--dry-run']);
  assert(n(dry.customers) === 2 && n(dry.customers_updated) === 1, 'the dry run counts customers');
  assert(n(dry.assets) === 1 && n(dry.assets_updated) === 1 && n(dry.hires) === 2, 'and assets and hires');

  const imported = run('import for real', ['hire.mjs', 'import', 'baseplan', `--customers=${customersCsv}`, `--assets=${assetsCsv}`, `--hires=${hiresCsv}`]);
  assert(n(imported.customers) === 2 && n(imported.hires) === 2 && n(imported.lines) === 2, 'and the real run does it');

  const kowhai = run('the imported hire reads back', ['hire.mjs', 'customer', 'Kowhai']);
  assert(kowhai.hires.length === 1 && kowhai.hires[0].status === 'live', 'the open contract landed live');

  const reimport = run('re-importing updates rather than duplicating', ['hire.mjs', 'import', 'baseplan', `--customers=${customersCsv}`, `--hires=${hiresCsv}`]);
  assert(n(reimport.customers) === 0 && n(reimport.customers_updated) === 3 && n(reimport.hires) === 0 && n(reimport.hires_updated) === 2, 'the second run creates nothing new');

  const missingFile = run('a missing import file fails loudly', ['hire.mjs', 'import', 'csv', `--customers=${path.join(dataDir, 'not-there.csv')}`], { json: false, expectFail: true });
  assert(/No customers file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  const tlCard = run('the imported saw carries no tag', ['hire.mjs', 'asset', 'TL-100']);
  assert(tlCard.asset.tag_tested_on === null, 'certificates deliberately do not import');

  // ---- export --------------------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['hire.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.customers.length === n(dump.counts.customers), 'the counts match the file');
  assert(parsed.hire_lines.length === n(dump.counts.hire_lines), 'lines included');

  // ---- the branded HTML ------------------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]yard\.html/.test(views.stdout) && /views[\\/]money\.html/.test(views.stdout), 'both views rendered');
  const yardHtml = readFileSync(path.join(root, 'views', 'yard.html'), 'utf8');
  assert(yardHtml.includes('Needs a decision') && yardHtml.includes('off-hire queue'), 'the yard view has its sections');
  assert(yardHtml.includes('runsheet') && yardHtml.includes('Available now'), 'and the rest of the yard');
  const moneyHtml = readFileSync(path.join(root, 'views', 'money.html'), 'utf8');
  assert(moneyHtml.includes('Utilisation') && moneyHtml.includes('Debtors'), 'the money view has its sections');

  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/invoice/.test(docs.stdout), 'the invoices rendered');
  assert(/hire-agreement-draft/.test(docs.stdout), 'the hire agreement drafts rendered');
  assert(/off-hire-docket/.test(docs.stdout), 'the off-hire dockets rendered');
  assert(/workshop-job-card/.test(docs.stdout), 'the workshop job cards rendered');

  // ---- the human readable side --------------------------------------------------------------

  run('fleet (text)', ['hire.mjs', 'fleet'], { json: false });
  run('asset (text)', ['hire.mjs', 'asset', 'FK-701'], { json: false });
  run('availability (text)', ['hire.mjs', 'availability'], { json: false });
  run('utilisation (text)', ['hire.mjs', 'utilisation'], { json: false });
  run('board (text)', ['hire.mjs', 'board'], { json: false });
  run('hire (text)', ['hire.mjs', 'hire', 'HC-1002'], { json: false });
  run('off-hires (text)', ['hire.mjs', 'off-hires'], { json: false });
  run('runsheet (text)', ['hire.mjs', 'runsheet'], { json: false });
  run('service (text)', ['hire.mjs', 'service'], { json: false });
  run('damage (text)', ['hire.mjs', 'damage', '--all'], { json: false });
  run('unbilled (text)', ['hire.mjs', 'unbilled'], { json: false });
  run('invoices (text)', ['hire.mjs', 'invoices', '--all'], { json: false });
  run('invoice (text)', ['hire.mjs', 'invoice', 'INV-2004'], { json: false });
  run('debtors (text)', ['hire.mjs', 'debtors'], { json: false });
  run('customers (text)', ['hire.mjs', 'customers'], { json: false });
  run('customer (text)', ['hire.mjs', 'customer', 'BayBuild'], { json: false });
  run('staff (text)', ['hire.mjs', 'staff'], { json: false });
  run('attention (text)', ['hire.mjs', 'attention'], { json: false });
  run('compliance (text)', ['hire.mjs', 'compliance'], { json: false });
  run('tasks (text)', ['hire.mjs', 'tasks', '--all'], { json: false });
  run('stats (text)', ['hire.mjs', 'stats'], { json: false });
  run('help', ['hire.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['hire.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}
