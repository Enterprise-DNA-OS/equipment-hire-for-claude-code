-- Demo data for equipment-hire-for-claude-code.
-- Kaimai Hire, a fictional Tauranga hire company: 5 staff, 14 customers, 20
-- machines across excavators, access gear, generators, compaction, site
-- accommodation and small plant, 13 contracts in every state, a workshop, a
-- damage register and five invoices.
--
-- Deliberately messy, so the attention list has something to say:
--   a scissor lift ON HIRE with its 6-monthly MEWP inspection 18 days expired
--   a generator ON HIRE with an expired test tag, on the same civil job
--   a roller on hire 60 meter hours past its service
--   a breaker that went out to a consumer with no pre-hire check, on a
--     contract that excludes the CGA (void against a consumer) and was never signed
--   a subdivision contract 9 days past its expected end, still on the meter
--   a site office on hire 340 days with no PPSR registration
--   a forklift off hire 8 days, still on the customer's site, with an $850
--     damage report nobody has charged
--   a finished dumper hire with $1,200 accrued and no bill drafted
--   a customer whose owing-plus-unbilled is past their credit limit
--   a stopped account with a pump still out
--   an invoice 45 days overdue and a draft that never went out
--   two machines idle more than 90 days, one lift 21 days in the workshop
--   a generator in the yard that cannot go out (never test tagged)
--
-- Dates are relative to current_date. Ids are derived from names with
-- seed_uuid, and every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Rates and names are DEMO VALUES for a fictional company. No real business
-- or person is depicted, and nothing here is legal or safety advice.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Staff -----------------------------------------------------------------------

insert into staff (id, full_name, code, email, phone, role, active) values
  (seed_uuid('staff:marie'), 'Marie Koru',   'MK', 'marie@kaimaihire.example.nz', '07 555 0101', 'manager',   true),
  (seed_uuid('staff:kelly'), 'Kelly Baxter', 'KB', 'kelly@kaimaihire.example.nz', '07 555 0102', 'hire desk', true),
  (seed_uuid('staff:denny'), 'Denny Ropata', 'DR', 'denny@kaimaihire.example.nz', '021 555 103', 'driver',    true),
  (seed_uuid('staff:piet'),  'Piet van Wyk', 'PV', 'piet@kaimaihire.example.nz',  '021 555 104', 'driver',    true),
  (seed_uuid('staff:sione'), 'Sione Tuima',  'ST', 'sione@kaimaihire.example.nz', '021 555 105', 'mechanic',  true)
on conflict do nothing;

-- Customers -------------------------------------------------------------------

insert into customers (id, name, code, account_type, contact_name, email, phone, city, terms_days, credit_limit_cents, on_stop, status, external_ref) values
  (seed_uuid('cust:baybuild'),    'BayBuild Construction Ltd',      'BAY001', 'trade',    'Rob Neilson',    'accounts@baybuild.example.nz',    '07 555 0201', 'Tauranga',   20, 2000000, false, 'active', 'BP-C001'),
  (seed_uuid('cust:harbourline'), 'Harbourline Civil Ltd',          'HAR001', 'trade',    'Trish Waaka',    'office@harbourline.example.nz',   '07 555 0202', 'Omokoroa',   20,  600000, false, 'active', 'BP-C002'),
  (seed_uuid('cust:coastal'),     'Coastal Scaffolding Ltd',        'COA001', 'trade',    'Mike Donnelly',  'admin@coastalscaff.example.nz',   '07 555 0203', 'Mount Maunganui', 20, 800000, false, 'active', 'BP-C003'),
  (seed_uuid('cust:fern'),        'Fern & Field Landscaping',       'FER001', 'trade',    'Aroha Field',    'hello@fernandfield.example.nz',   '021 555 204', 'Bethlehem',  20,  500000, false, 'active', 'BP-C004'),
  (seed_uuid('cust:pounamu'),     'Pounamu Events Ltd',             'POU001', 'trade',    'Shannon Kire',   'events@pounamu.example.nz',       '07 555 0205', 'Tauranga',   20,  400000, false, 'active', 'BP-C005'),
  (seed_uuid('cust:tepuke'),      'Te Puke Orchard Services Ltd',   'TEP001', 'trade',    'Hemi Rolleston', 'office@tporchard.example.nz',     '07 555 0206', 'Te Puke',    20,  600000, false, 'active', 'BP-C006'),
  (seed_uuid('cust:wbop'),        'Western BOP District Council',   'WBO001', 'trade',    'Lauren Speer',   'ap@westernbop.example.nz',        '07 555 0207', 'Katikati',   30, null,    false, 'active', 'BP-C007'),
  (seed_uuid('cust:tasman'),      'Tasman Drainage Ltd',            'TAS001', 'trade',    'Gary Pascoe',    'gary@tasmandrainage.example.nz',  '021 555 208', 'Tauriko',    20,  300000, true,  'active', 'BP-C008'),
  (seed_uuid('cust:mount'),       'Mount Roofing Co Ltd',           'MOU001', 'trade',    'Steve Aldous',   'jobs@mountroofing.example.nz',    '07 555 0209', 'Papamoa',    20,  500000, false, 'active', 'BP-C009'),
  (seed_uuid('cust:aztec'),       'Aztec Pools & Spas Ltd',         'AZT001', 'trade',    'Carla Reid',     'carla@aztecpools.example.nz',     '07 555 0210', 'Tauranga',   20,  400000, false, 'active', 'BP-C010'),
  (seed_uuid('cust:kereru'),      'Kereru Vineyards Ltd',           'KER001', 'trade',    'Paul Verhoeven', 'accounts@kereruwine.example.nz',  '07 555 0211', 'Katikati',   20, 1000000, false, 'active', 'BP-C011'),
  (seed_uuid('cust:lammers'),     'Dave Lammers',                   'LAM001', 'consumer', 'Dave Lammers',   'd.lammers@example.nz',            '021 555 212', 'Otumoetai',  7,   null,    false, 'active', 'BP-C012'),
  (seed_uuid('cust:skyline'),     'Skyline Exteriors Ltd',          'SKY001', 'trade',    'Nadia Petrov',   'nadia@skylineext.example.nz',     '07 555 0213', 'Tauranga',   20,  500000, false, 'active', 'BP-C013'),
  (seed_uuid('cust:greerton'),    'Greerton Community Trust',       'GRE001', 'consumer', 'June Materoa',   'hall@greertontrust.example.nz',   '07 555 0214', 'Greerton',   20,  null,    false, 'active', 'BP-C014')
on conflict do nothing;

-- The fleet ---------------------------------------------------------------------
-- Rates are cents per day / per week. Meter hours where the machine has one.

insert into assets (id, code, category, description, make, model, serial, year, purchased_on, cost_cents,
                    day_rate_cents, week_rate_cents, status, meter_hours, service_interval_hours, service_interval_months,
                    last_service_on, last_service_hours, electrical, tag_tested_on, tag_interval_months,
                    inspection_kind, inspection_expires_on, external_ref) values
  (seed_uuid('asset:ex101'), 'EX-101', 'excavator',    'Kubota U17-3 1.7t excavator',      'Kubota',  'U17-3',    'KX17-44821', 2023, current_date - 800,  4200000, 18000, 72000,  'in-fleet', 2140, 250, null, current_date - 30,  2050, false, null, 3, null, null, 'BP-A101'),
  (seed_uuid('asset:ex102'), 'EX-102', 'excavator',    'Hitachi ZX48U 5t excavator',       'Hitachi', 'ZX48U-5A', 'HZ48-90112', 2022, current_date - 1100, 9800000, 28500, 114000, 'in-fleet', 3480, 250, null, current_date - 45,  3300, false, null, 3, null, null, 'BP-A102'),
  (seed_uuid('asset:ex103'), 'EX-103', 'excavator',    'Kubota U17-3 1.7t excavator',      'Kubota',  'U17-3',    'KX17-51230', 2024, current_date - 700,  4400000, 18000, 72000,  'in-fleet', 1800, 250, null, current_date - 140, 1700, false, null, 3, null, null, 'BP-A103'),
  (seed_uuid('asset:sl201'), 'SL-201', 'scissor-lift', 'Genie GS-1932 19ft scissor lift',  'Genie',   'GS-1932',  'GS32-77410', 2021, current_date - 1500, 2800000, 12000, 48000,  'in-fleet', null, null, null, null, null, false, null, 3, 'mewp-6-monthly', current_date - 18,  'BP-A201'),
  (seed_uuid('asset:sl202'), 'SL-202', 'scissor-lift', 'Genie GS-2646 26ft scissor lift',  'Genie',   'GS-2646',  'GS46-81022', 2022, current_date - 1200, 3600000, 13500, 54000,  'in-fleet', null, null, null, null, null, false, null, 3, 'mewp-6-monthly', current_date + 90,  'BP-A202'),
  (seed_uuid('asset:sl203'), 'SL-203', 'scissor-lift', 'JLG 1932R 19ft scissor lift',      'JLG',     '1932R',    'JL32-66019', 2020, current_date - 1900, 2500000, 12000, 48000,  'workshop', null, null, null, null, null, false, null, 3, 'mewp-6-monthly', current_date + 120, 'BP-A203'),
  (seed_uuid('asset:bl301'), 'BL-301', 'boom-lift',    'Genie Z-45/25 45ft boom lift',     'Genie',   'Z-45/25',  'GZ45-30988', 2021, current_date - 1400, 8900000, 34000, 136000, 'in-fleet', null, null, null, null, null, false, null, 3, 'mewp-6-monthly', current_date + 45,  'BP-A301'),
  (seed_uuid('asset:gn401'), 'GN-401', 'generator',    'Denyo 6kVA diesel generator',      'Denyo',   'DCA-6',    'DN6-11842',  2022, current_date - 1000, 1400000, 6500,  26000,  'in-fleet', 4100, null, 12,   current_date - 90,  null, true, current_date - 135, 3, null, null, 'BP-A401'),
  (seed_uuid('asset:gn402'), 'GN-402', 'generator',    'Denyo 6kVA diesel generator',      'Denyo',   'DCA-6',    'DN6-13501',  2023, current_date - 600,  1500000, 6500,  26000,  'in-fleet', 2200, null, 12,   current_date - 60,  null, true, current_date - 20,  3, null, null, 'BP-A402'),
  (seed_uuid('asset:gn403'), 'GN-403', 'generator',    'Honda EU22i 2.2kVA generator',     'Honda',   'EU22i',    'HE22-90471', 2025, current_date - 80,   250000,  4500,  18000,  'in-fleet', 60,   null, 12,   null,               null, true, null,               3, null, null, 'BP-A403'),
  (seed_uuid('asset:cp501'), 'CP-501', 'compressor',   'Airman 185cfm compressor',         'Airman',  'PDS185S',  'AM185-2210', 2021, current_date - 1600, 2200000, 9000,  36000,  'in-fleet', 3900, null, 12,   current_date - 100, null, false, null, 3, null, null, 'BP-A501'),
  (seed_uuid('asset:br601'), 'BR-601', 'breaker',      'Hilti TE 3000 electric breaker',   'Hilti',   'TE 3000',  'HT30-55210', 2024, current_date - 400,  450000,  5500,  22000,  'in-fleet', null, null, null, null, null, true, current_date - 15,  3, null, null, 'BP-A601'),
  (seed_uuid('asset:fk701'), 'FK-701', 'forklift',     'Toyota 2.5t forklift',             'Toyota',  '8FG25',    'TY25-71180', 2019, current_date - 2200, 3800000, 9500,  38000,  'in-fleet', 6100, 250, null, current_date - 100, 6010, false, null, 3, null, null, 'BP-A701'),
  (seed_uuid('asset:rl801'), 'RL-801', 'roller',       'Ammann ARX12 1.2t roller',         'Ammann',  'ARX12',    'AM12-40911', 2022, current_date - 1000, 3100000, 21000, 84000,  'in-fleet', 1560, 250, null, current_date - 120, 1250, false, null, 3, null, null, 'BP-A801'),
  (seed_uuid('asset:dp901'), 'DP-901', 'dumper',       'Thwaites 1t hi-tip dumper',        'Thwaites','MACH201',  'TW10-88012', 2023, current_date - 900,  2700000, 15000, 60000,  'in-fleet', 890,  250, null, current_date - 200, 700,  false, null, 3, null, null, 'BP-A901'),
  (seed_uuid('asset:pc951'), 'PC-951', 'site-cabin',   'Portacom 3.6m site office',        'Portacom','PC36',     'PC36-1204',  2020, current_date - 2000, 1800000, 3000,  12000,  'in-fleet', null, null, 24,   current_date - 300, null, false, null, 3, null, null, 'BP-A951'),
  (seed_uuid('asset:pc952'), 'PC-952', 'site-cabin',   'Portacom 2.4m lunchroom',          'Portacom','PC24',     'PC24-0988',  2021, current_date - 200,  1400000, 2800,  11200,  'in-fleet', null, null, 24,   current_date - 100, null, false, null, 3, null, null, 'BP-A952'),
  (seed_uuid('asset:wp971'), 'WP-971', 'pump',         'Tsurumi 2in submersible pump',     'Tsurumi', 'HS2.4S',   'TS24-33019', 2023, current_date - 700,  180000,  4000,  16000,  'in-fleet', null, null, 12,   current_date - 60,  null, true, current_date - 25,  3, null, null, 'BP-A971'),
  (seed_uuid('asset:tr981'), 'TR-981', 'trailer',      'Single axle plant trailer 2t',     'MTE',     'PT20',     'MT20-60112', 2022, current_date - 1300, 900000,  3500,  14000,  'in-fleet', null, null, 12,   current_date - 200, null, false, null, 3, null, null, 'BP-A981'),
  (seed_uuid('asset:lt991'), 'LT-991', 'lighting',     'Wacker LTV6 lighting tower',       'Wacker',  'LTV6',     'WK6-20831',  2021, current_date - 1500, 2400000, 11000, 44000,  'in-fleet', 2600, null, 12,   current_date - 80,  null, true, current_date - 30,  3, null, null, 'BP-A991')
on conflict do nothing;

-- Hire contracts -----------------------------------------------------------------
-- billed_through on older lines reflects invoices raised in the old system
-- before cutover; only the recent windows are billed from here.

insert into hires (id, ref, customer_id, site, po_number, status, start_on, expected_end_on, off_hired_on, closed_on,
                   taken_by_id, contract_signed_on, cga_excluded, ppsr_registered_on, note, external_ref) values
  (seed_uuid('hire:1000'), 'HC-1000', seed_uuid('cust:baybuild'),    'Welcome Bay culvert job',        'PO-4471', 'closed',    current_date - 134, current_date - 121, current_date - 120, current_date - 118, seed_uuid('staff:kelly'), current_date - 134, false, null, null, 'BP-H1000'),
  (seed_uuid('hire:1001'), 'HC-1001', seed_uuid('cust:wbop'),        'Katikati transfer station',      'WBOP-2211','live',     current_date - 340, null,               null, null, seed_uuid('staff:kelly'), current_date - 340, false, null, 'Long-term site office. Council reviews annually.', 'BP-H1001'),
  (seed_uuid('hire:1002'), 'HC-1002', seed_uuid('cust:baybuild'),    'Pyes Pa subdivision stage 2',    'PO-4512', 'live',      current_date - 24,  current_date - 9,   null, null, seed_uuid('staff:kelly'), current_date - 24,  false, null, null, 'BP-H1002'),
  (seed_uuid('hire:1003'), 'HC-1003', seed_uuid('cust:harbourline'), 'Omokoroa boardwalk',             'HL-889',  'live',      current_date - 60,  current_date + 14,  null, null, seed_uuid('staff:marie'), current_date - 60,  false, null, null, 'BP-H1003'),
  (seed_uuid('hire:1004'), 'HC-1004', seed_uuid('cust:fern'),        'Bethlehem College landscaping',  null,      'live',      current_date - 8,   current_date + 6,   null, null, seed_uuid('staff:kelly'), current_date - 8,   false, null, null, 'BP-H1004'),
  (seed_uuid('hire:1005'), 'HC-1005', seed_uuid('cust:pounamu'),     'Jazz festival, Memorial Park',   'PE-102',  'booked',    current_date + 3,   current_date + 6,   null, null, seed_uuid('staff:kelly'), current_date - 2,   false, null, 'Deliver before Friday soundcheck.', 'BP-H1005'),
  (seed_uuid('hire:1006'), 'HC-1006', seed_uuid('cust:lammers'),     'Home reno, 14 Oceanview Rd',     null,      'live',      current_date - 5,   current_date + 2,   null, null, seed_uuid('staff:kelly'), null,               true,  null, null, 'BP-H1006'),
  (seed_uuid('hire:1007'), 'HC-1007', seed_uuid('cust:coastal'),     'Tauriko warehouse fit-out',      'CS-310',  'off-hired', current_date - 20,  current_date - 7,   current_date - 8, null, seed_uuid('staff:marie'), current_date - 20,  false, null, null, 'BP-H1007'),
  (seed_uuid('hire:1008'), 'HC-1008', seed_uuid('cust:mount'),       'Papamoa re-roof, 8 Domain Rd',   'MR-77',   'off-hired', current_date - 16,  current_date - 4,   current_date - 3, null, seed_uuid('staff:kelly'), current_date - 16,  false, null, null, 'BP-H1008'),
  (seed_uuid('hire:1009'), 'HC-1009', seed_uuid('cust:tepuke'),      'Frost fan compressor work',      'TP-556',  'closed',    current_date - 90,  current_date - 77,  current_date - 76, current_date - 70, seed_uuid('staff:kelly'), current_date - 90,  false, null, null, 'BP-H1009'),
  (seed_uuid('hire:1010'), 'HC-1010', seed_uuid('cust:tasman'),      'Judea depot yard dewatering',    'TD-201',  'live',      current_date - 30,  current_date + 30,  null, null, seed_uuid('staff:marie'), current_date - 30,  false, null, 'Account went on stop after the hire started.', 'BP-H1010'),
  (seed_uuid('hire:1011'), 'HC-1011', seed_uuid('cust:kereru'),      'Frost season night lighting',    'KV-98',   'closed',    current_date - 75,  current_date - 48,  current_date - 47, current_date - 40, seed_uuid('staff:kelly'), current_date - 75,  false, null, null, 'BP-H1011'),
  (seed_uuid('hire:1012'), 'HC-1012', seed_uuid('cust:aztec'),       'Pool dig access, 22 Grange Rd',  'AZ-410',  'off-hired', current_date - 26,  current_date - 13,  current_date - 12, null, seed_uuid('staff:kelly'), current_date - 26,  false, null, null, 'BP-H1012')
on conflict do nothing;

insert into hire_lines (id, hire_id, asset_id, day_rate_cents, week_rate_cents, on_hired_on, off_hired_on, picked_up_on,
                        pre_hire_check_on, pre_hire_check_by, billed_through, note) values
  (seed_uuid('line:1000-ex103'), seed_uuid('hire:1000'), seed_uuid('asset:ex103'), 18000, 72000,  current_date - 134, current_date - 120, current_date - 120, current_date - 134, seed_uuid('staff:denny'), current_date - 121, null),
  (seed_uuid('line:1001-pc951'), seed_uuid('hire:1001'), seed_uuid('asset:pc951'), 3000,  12000,  current_date - 340, null, null, current_date - 340, seed_uuid('staff:denny'), current_date - 31,  'Billed monthly.'),
  (seed_uuid('line:1002-ex102'), seed_uuid('hire:1002'), seed_uuid('asset:ex102'), 28500, 114000, current_date - 24,  null, null, current_date - 24,  seed_uuid('staff:denny'), current_date - 15,  null),
  (seed_uuid('line:1002-rl801'), seed_uuid('hire:1002'), seed_uuid('asset:rl801'), 21000, 84000,  current_date - 24,  null, null, current_date - 24,  seed_uuid('staff:denny'), current_date - 15,  null),
  (seed_uuid('line:1003-sl201'), seed_uuid('hire:1003'), seed_uuid('asset:sl201'), 12000, 48000,  current_date - 60,  null, null, current_date - 60,  seed_uuid('staff:piet'),  current_date - 25,  null),
  (seed_uuid('line:1003-gn401'), seed_uuid('hire:1003'), seed_uuid('asset:gn401'), 6500,  26000,  current_date - 60,  null, null, current_date - 60,  seed_uuid('staff:piet'),  current_date - 25,  null),
  (seed_uuid('line:1004-ex101'), seed_uuid('hire:1004'), seed_uuid('asset:ex101'), 18000, 72000,  current_date - 8,   null, null, current_date - 8,   seed_uuid('staff:denny'), current_date - 3,   null),
  (seed_uuid('line:1005-gn402'), seed_uuid('hire:1005'), seed_uuid('asset:gn402'), 6500,  26000,  null, null, null, null, null, null, null),
  (seed_uuid('line:1006-br601'), seed_uuid('hire:1006'), seed_uuid('asset:br601'), 5500,  22000,  current_date - 5,   null, null, null, null, null, 'Went out on the Saturday rush. No check recorded.'),
  (seed_uuid('line:1007-fk701'), seed_uuid('hire:1007'), seed_uuid('asset:fk701'), 9500,  38000,  current_date - 20,  current_date - 8, null, current_date - 20, seed_uuid('staff:piet'), current_date - 14, null),
  (seed_uuid('line:1008-dp901'), seed_uuid('hire:1008'), seed_uuid('asset:dp901'), 15000, 60000,  current_date - 16,  current_date - 3, current_date - 3, current_date - 16, seed_uuid('staff:denny'), null, null),
  (seed_uuid('line:1008-sl202'), seed_uuid('hire:1008'), seed_uuid('asset:sl202'), 13500, 54000,  current_date - 16,  current_date - 3, current_date - 3, current_date - 16, seed_uuid('staff:denny'), current_date - 4, 'Billed with the fortnight run.'),
  (seed_uuid('line:1009-cp501'), seed_uuid('hire:1009'), seed_uuid('asset:cp501'), 9000,  36000,  current_date - 90,  current_date - 76, current_date - 76, current_date - 90, seed_uuid('staff:denny'), current_date - 77, null),
  (seed_uuid('line:1009-gn402'), seed_uuid('hire:1009'), seed_uuid('asset:gn402'), 6500,  26000,  current_date - 90,  current_date - 76, current_date - 76, current_date - 90, seed_uuid('staff:denny'), current_date - 77, null),
  (seed_uuid('line:1010-wp971'), seed_uuid('hire:1010'), seed_uuid('asset:wp971'), 4000,  16000,  current_date - 30,  null, null, current_date - 30,  seed_uuid('staff:piet'),  current_date - 3,   null),
  (seed_uuid('line:1011-lt991'), seed_uuid('hire:1011'), seed_uuid('asset:lt991'), 11000, 44000,  current_date - 75,  current_date - 47, current_date - 47, current_date - 75, seed_uuid('staff:piet'), current_date - 48, null),
  (seed_uuid('line:1011-bl301'), seed_uuid('hire:1011'), seed_uuid('asset:bl301'), 34000, 136000, current_date - 75,  current_date - 47, current_date - 47, current_date - 75, seed_uuid('staff:piet'), current_date - 48, 'Boom lift for the net rig. Billed in the old system.'),
  (seed_uuid('line:1012-tr981'), seed_uuid('hire:1012'), seed_uuid('asset:tr981'), 3500,  14000,  current_date - 26,  current_date - 12, current_date - 12, current_date - 26, seed_uuid('staff:denny'), current_date - 13, null)
on conflict do nothing;

-- Deliveries and pickups ----------------------------------------------------------

insert into deliveries (id, hire_id, kind, scheduled_on, driver_id, status, done_on, note) values
  (seed_uuid('del:1005-out'), seed_uuid('hire:1005'), 'deliver', current_date + 3, seed_uuid('staff:denny'), 'scheduled', null, 'Before Friday soundcheck. Gate code 4471.'),
  (seed_uuid('del:1007-back'),seed_uuid('hire:1007'), 'pickup',  current_date,     seed_uuid('staff:piet'),  'scheduled', null, 'Forklift. Site closes 4pm.'),
  (seed_uuid('del:1004-out'), seed_uuid('hire:1004'), 'deliver', current_date - 8, seed_uuid('staff:denny'), 'done', current_date - 8, null),
  (seed_uuid('del:1008-back'),seed_uuid('hire:1008'), 'pickup',  current_date - 3, seed_uuid('staff:piet'),  'done', current_date - 3, null)
on conflict do nothing;

-- The workshop ----------------------------------------------------------------------

insert into services (id, asset_id, kind, opened_on, due_on, status, done_on, cost_cents, mechanic_id, note) values
  (seed_uuid('svc:sl203-motor'), seed_uuid('asset:sl203'), 'repair',     current_date - 21,  null,              'in-workshop', null, null, seed_uuid('staff:sione'), 'Drive motor fault. Parts on order from JLG.'),
  (seed_uuid('svc:rl801-due'),   seed_uuid('asset:rl801'), 'scheduled',  current_date - 5,   current_date - 5,  'due',         null, null, seed_uuid('staff:sione'), '250 hour service now 60 hours overdue. Machine is on hire at Pyes Pa.'),
  (seed_uuid('svc:gn403-tag'),   seed_uuid('asset:gn403'), 'tag-test',   current_date - 10,  current_date - 10, 'due',         null, null, null, 'New unit, never test tagged. Cannot go out until done.'),
  (seed_uuid('svc:sl201-insp'),  seed_uuid('asset:sl201'), 'inspection', current_date - 18,  current_date - 18, 'due',         null, null, null, '6-monthly MEWP inspection lapsed while on hire at Omokoroa.'),
  (seed_uuid('svc:ex102-done'),  seed_uuid('asset:ex102'), 'scheduled',  current_date - 45,  current_date - 45, 'done', current_date - 45, 42000, seed_uuid('staff:sione'), '250 hour service.'),
  (seed_uuid('svc:fk701-done'),  seed_uuid('asset:fk701'), 'scheduled',  current_date - 100, current_date - 100,'done', current_date - 100, 38000, seed_uuid('staff:sione'), null),
  (seed_uuid('svc:cp501-done'),  seed_uuid('asset:cp501'), 'scheduled',  current_date - 100, current_date - 100,'done', current_date - 100, 26000, seed_uuid('staff:sione'), null)
on conflict do nothing;

-- Damage ------------------------------------------------------------------------------

insert into damage_reports (id, hire_line_id, reported_on, description, est_cost_cents, status, charged_cents, invoice_id, waived_reason) values
  (seed_uuid('dmg:fk701'), seed_uuid('line:1007-fk701'), current_date - 8,  'Dented mast guard and torn seat. Photos in the yard folder.', 85000, 'open',    null,  null, null),
  (seed_uuid('dmg:lt991'), seed_uuid('line:1011-lt991'), current_date - 47, 'Cracked lens on tower head.',                                 32000, 'charged', 32000, seed_uuid('inv:2003'), null),
  (seed_uuid('dmg:cp501'), seed_uuid('line:1009-cp501'), current_date - 76, 'Scuffed panels.',                                             12000, 'waived',  null,  null, 'Fair wear and tear.')
on conflict do nothing;

-- Invoices ----------------------------------------------------------------------------

insert into invoices (id, number, hire_id, customer_id, issued_on, due_on, total_cents, status, sent_on, paid_on, note) values
  (seed_uuid('inv:2001'), 'INV-2001', seed_uuid('hire:1001'), seed_uuid('cust:wbop'),        current_date - 31, current_date - 1,  54000,  'paid',  current_date - 31, current_date - 8, 'Monthly site office hire.'),
  (seed_uuid('inv:2002'), 'INV-2002', seed_uuid('hire:1009'), seed_uuid('cust:tepuke'),      current_date - 74, current_date - 54, 72000,  'paid',  current_date - 74, current_date - 50, null),
  (seed_uuid('inv:2003'), 'INV-2003', seed_uuid('hire:1011'), seed_uuid('cust:kereru'),      current_date - 65, current_date - 45, 208000, 'sent',  current_date - 65, null, 'Hire plus damage to tower head.'),
  (seed_uuid('inv:2004'), 'INV-2004', seed_uuid('hire:1003'), seed_uuid('cust:harbourline'), current_date - 26, current_date - 6,  370000, 'sent',  current_date - 26, null, 'Weeks 1 to 5, Omokoroa boardwalk.'),
  (seed_uuid('inv:2005'), 'INV-2005', seed_uuid('hire:1012'), seed_uuid('cust:aztec'),       current_date - 12, current_date + 8,  28000,  'draft', null, null, 'Drafted at off-hire and never sent.')
on conflict do nothing;

insert into invoice_lines (id, invoice_id, hire_line_id, damage_id, description, amount_cents) values
  (seed_uuid('il:2001-1'), seed_uuid('inv:2001'), seed_uuid('line:1001-pc951'), null, 'Portacom 3.6m site office, 30 days',            54000),
  (seed_uuid('il:2002-1'), seed_uuid('inv:2002'), seed_uuid('line:1009-cp501'), null, 'Airman 185cfm compressor, 14 days',             72000),
  (seed_uuid('il:2003-1'), seed_uuid('inv:2003'), seed_uuid('line:1011-lt991'), null, 'Wacker LTV6 lighting tower, 28 days',           176000),
  (seed_uuid('il:2003-2'), seed_uuid('inv:2003'), null, seed_uuid('dmg:lt991'), 'Damage: cracked lens on tower head',                  32000),
  (seed_uuid('il:2004-1'), seed_uuid('inv:2004'), seed_uuid('line:1003-sl201'), null, 'Genie GS-1932 scissor lift, weeks 1 to 5',      240000),
  (seed_uuid('il:2004-2'), seed_uuid('inv:2004'), seed_uuid('line:1003-gn401'), null, 'Denyo 6kVA generator, weeks 1 to 5',            130000),
  (seed_uuid('il:2005-1'), seed_uuid('inv:2005'), seed_uuid('line:1012-tr981'), null, 'Single axle plant trailer, 14 days',            28000)
on conflict do nothing;

-- Notes ------------------------------------------------------------------------------

insert into notes (id, customer_id, hire_id, asset_id, staff_id, noted_on, channel, note) values
  (seed_uuid('note:bay1'),  seed_uuid('cust:baybuild'),    seed_uuid('hire:1002'), null, seed_uuid('staff:kelly'), current_date - 9,  'phone', 'Rob says the subdivision ran over. Keeping the digger and roller another fortnight, will confirm the end date Monday.'),
  (seed_uuid('note:har1'),  seed_uuid('cust:harbourline'), seed_uuid('hire:1003'), null, seed_uuid('staff:marie'), current_date - 6,  'phone', 'Chased INV-2004. Trish says the council progress payment lands next week.'),
  (seed_uuid('note:coa1'),  seed_uuid('cust:coastal'),     seed_uuid('hire:1007'), seed_uuid('asset:fk701'), seed_uuid('staff:piet'), current_date - 8, 'site', 'Return check on the forklift found a dented mast guard and torn seat. Told the foreman on site, photos taken.'),
  (seed_uuid('note:tas1'),  seed_uuid('cust:tasman'),      null, null, seed_uuid('staff:marie'), current_date - 12, 'phone', 'Account on stop until the March account is settled. Gary aware. Pump stays out for now per Marie.'),
  (seed_uuid('note:wbop1'), seed_uuid('cust:wbop'),        seed_uuid('hire:1001'), null, seed_uuid('staff:kelly'), current_date - 40, 'email', 'Council confirmed the transfer station office runs to at least next winter.'),
  (seed_uuid('note:sky1'),  seed_uuid('cust:skyline'),     null, null, seed_uuid('staff:kelly'), current_date - 4,  'phone', 'Nadia asking for a long-term rate on two scissor lifts for the hospital job. Wants a quote this week.')
on conflict do nothing;

-- Tasks ------------------------------------------------------------------------------

insert into tasks (id, title, customer_id, hire_id, asset_id, staff_id, due_on, status, note) values
  (seed_uuid('task:skyline'), 'Quote Skyline Exteriors the long-term scissor package', seed_uuid('cust:skyline'), null, null, seed_uuid('staff:kelly'), current_date - 2, 'open', 'Two lifts, three months, hospital job. Nadia rang twice.'),
  (seed_uuid('task:har'),     'Chase Harbourline again if INV-2004 not paid by Friday', seed_uuid('cust:harbourline'), seed_uuid('hire:1003'), null, seed_uuid('staff:marie'), current_date + 1, 'open', null)
on conflict do nothing;
