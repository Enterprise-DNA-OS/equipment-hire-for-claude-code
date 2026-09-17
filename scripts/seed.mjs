#!/usr/bin/env node
// Loads supabase/seed.sql: Kaimai Hire, a fictional Tauranga hire company with
// 5 staff, 14 customers, 20 machines, 13 contracts in every state, a workshop
// queue, a damage register and five invoices. Every row has a derived id and
// inserts with ON CONFLICT DO NOTHING, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from staff)          as staff,
           (select count(*) from customers)      as customers,
           (select count(*) from assets)         as assets,
           (select count(*) from hires)          as hires,
           (select count(*) from hire_lines)     as hire_lines,
           (select count(*) from deliveries)     as deliveries,
           (select count(*) from services)       as services,
           (select count(*) from damage_reports) as damage_reports,
           (select count(*) from invoices)       as invoices,
           (select count(*) from invoice_lines)  as invoice_lines,
           (select count(*) from notes)          as notes,
           (select count(*) from tasks)          as tasks
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.staff} staff, ${n.customers} customers, ${n.assets} machines, ${n.hires} hires ` +
        `(${n.hire_lines} lines), ${n.deliveries} deliveries, ${n.services} workshop jobs, ` +
        `${n.damage_reports} damage reports, ${n.invoices} invoices, ${n.notes} notes, ${n.tasks} tasks`,
    );
  } finally {
    await db.close();
  }
}
