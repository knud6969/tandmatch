-- Test 10: Besøgende uden session kan kun læse offentlige tabeller og public_*-funktioner; public_* returnerer ingen priser,
-- tandlæger eller portefølje for imported klinikker, slet intet for registered klinikker (H1) og aldrig owner_id eller cvr.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- En booking og en blokering hos X, så public_busy_intervals() har noget at vise
select tt.mk_case('pA', 'S_busy');
select tt.mk_booking(tt.mk_lead('S_busy', 'X', 'booked'), 'undersoegelse', tt.slot(3, 10));
insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at) values (tt.cid('X'), tt.slot(4, 12), tt.slot(4, 13));
-- En booking på en senere ikke-verificeret klinik må ikke vises
select tt.mk_case('pA', 'S_busy_a6');
select tt.mk_booking(tt.mk_lead('S_busy_a6', 'A6', 'booked'), 'undersoegelse', tt.slot(3, 11));
select public.admin_set_clinic_status(tt.cid('A6'), 'registered');

select tt.as_anon();

-- Private tabeller (permission denied eller 0 rækker)
select tt.rows('select 1 from public.clinics', 0, 'anon kan ikke læse clinics');
select tt.rows('select 1 from public.clinic_prices', 0, 'anon kan ikke læse clinic_prices');
select tt.rows('select 1 from public.clinic_opening_hours', 0, 'anon kan ikke læse clinic_opening_hours');
select tt.rows('select 1 from public.clinic_time_blocks', 0, 'anon kan ikke læse clinic_time_blocks');
select tt.rows('select 1 from public.clinic_dentists', 0, 'anon kan ikke læse clinic_dentists');
select tt.rows('select 1 from public.portfolio_items', 0, 'anon kan ikke læse portfolio_items');
select tt.rows('select 1 from public.profiles', 0, 'anon kan ikke læse profiles');
select tt.rows('select 1 from public.patients', 0, 'anon kan ikke læse patients');
select tt.rows('select 1 from public.cases', 0, 'anon kan ikke læse cases');
select tt.rows('select 1 from public.case_services', 0, 'anon kan ikke læse case_services');
select tt.rows('select 1 from public.case_images', 0, 'anon kan ikke læse case_images');
select tt.rows('select 1 from public.ai_conversations', 0, 'anon kan ikke læse ai_conversations');
select tt.rows('select 1 from public.ai_messages', 0, 'anon kan ikke læse ai_messages');
select tt.rows('select 1 from public.consents', 0, 'anon kan ikke læse consents');
select tt.rows('select 1 from public.terms_acceptances', 0, 'anon kan ikke læse terms_acceptances');
select tt.rows('select 1 from public.leads', 0, 'anon kan ikke læse leads');
select tt.rows('select 1 from public.messages', 0, 'anon kan ikke læse messages');
select tt.rows('select 1 from public.bookings', 0, 'anon kan ikke læse bookings');
select tt.rows('select 1 from public.reviews', 0, 'anon kan ikke læse reviews');
select tt.rows('select 1 from public.review_replies', 0, 'anon kan ikke læse review_replies');
select tt.rows('select 1 from public.ai_limits', 0, 'anon kan ikke læse ai_limits');
select tt.rows('select 1 from public.rate_limits', 0, 'anon kan ikke læse rate_limits');
select tt.denied(format('insert into public.cases (patient_id) values (%L)', tt.id('pA')), 'anon kan ikke skrive til cases');
select tt.denied('select public.clinic_leads()', 'anon kan ikke kalde clinic_leads()');
select tt.denied(format('select public.clinic_lead_detail(%L)', tt.id('x')), 'anon kan ikke kalde clinic_lead_detail()');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('X')), 'anon kan ikke kalde send_leads');

-- Offentlige tabeller
select tt.ok(tt.vis('select 1 from public.services') > 0, 'anon kan læse aktive ydelser');
select tt.ok(tt.vis('select 1 from public.postal_codes') > 0, 'anon kan læse postnumre');
select tt.ok(tt.vis('select 1 from public.consent_text_versions') > 0, 'anon kan læse samtykketekster');

-- public_clinics(): kun verificerede (fulde felter) og importerede uden ejer; registered er usynlig (H1)
create temp table pc as select * from public.public_clinics(array[tt.svc('undersoegelse')]);
select tt.eq((select count(*) from pc)::int, 11, 'public_clinics() viser 10 verificerede og 1 importeret (R og A6 er registered)');
select tt.eq((select count(*) from pc where status = 'verified')::int, 10, 'public_clinics(): 10 verificerede (A6 er nu registered)');
select tt.eq((select count(*) from pc where status = 'imported')::int, 1, 'public_clinics(): kun I er importeret; ingen registered maskeres');
select tt.eq((select count(*) from pc where prices is not null or logo_path is not null or has_emergency_hours is not null)::int,
             (select count(*) from pc where status = 'verified' and (prices is not null))::int, 'kun verificerede har fulde felter');
select tt.eq((select count(*) from pc where status = 'imported' and (prices is not null or logo_path is not null or has_emergency_hours is not null))::int, 0,
             'imported/registered har ingen priser, logo eller akut-flag');
select tt.ok((select count(*) from pc where status = 'verified' and jsonb_array_length(prices) = 1) = 10, 'verificerede viser pris for den angivne ydelse');
select tt.ok(not tt.fn_returns_column('public.public_clinics(uuid[], uuid[])', 'owner_id'), 'public_clinics() har ingen owner_id');
select tt.ok(not tt.fn_returns_column('public.public_clinics(uuid[], uuid[])', 'cvr'), 'public_clinics() har ingen cvr');
select tt.ok(position('10000012' in (select jsonb_agg(p)::text from pc p)) = 0, 'public_clinics() indeholder ikke noget CVR');
select tt.ok(position(tt.id('uR')::text in (select jsonb_agg(p)::text from pc p)) = 0, 'public_clinics() indeholder ikke ejerens id');

-- public_clinic_profile(): ingen beskrivelse, prisliste, tandlæger eller portefølje for imported/registered
select tt.ok(not tt.fn_returns_column('public.public_clinic_profile(uuid, uuid[])', 'owner_id'), 'public_clinic_profile() har ingen owner_id');
select tt.ok(not tt.fn_returns_column('public.public_clinic_profile(uuid, uuid[])', 'cvr'), 'public_clinic_profile() har ingen cvr');
select tt.eq((select count(*) from public.public_clinic_profile(tt.cid('I')) where all_prices is null and dentists is null and description is null and prices is null)::int, 1,
             'importeret klinik: ingen prisliste, tandlæger, portefølje eller beskrivelse');
select tt.eq((select count(*) from public.public_clinic_profile(tt.cid('R')))::int, 0, 'H1: registered klinik har ingen offentlig profil');
select tt.eq((select count(*) from public.public_clinic_profile(tt.cid('A6')))::int, 0, 'H1: verificeret klinik sat til registered forsvinder');
select tt.eq((select count(*) from pc where id in (tt.cid('R'), tt.cid('A6')))::int, 0, 'H1: registered klinikker er ikke i oversigten');
select tt.eq((select count(*) from public.public_clinics(null, array[tt.cid('R')]))::int, 0, 'H1: registered klinik kan ikke slås op på id');
select tt.eq((select jsonb_array_length(dentists) from public.public_clinic_profile(tt.cid('X'))), 1, 'verificeret klinik: tandlæge vises');
select tt.eq((select jsonb_array_length(dentists -> 0 -> 'portfolio') from public.public_clinic_profile(tt.cid('X'))), 1, 'verificeret klinik: portefølje vises');
select tt.eq((select jsonb_array_length(all_prices) from public.public_clinic_profile(tt.cid('X'))), 2, 'verificeret klinik: hele prislisten vises');

-- public_busy_intervals(): kun verificerede, kun tidsrum
select tt.ok(tt.fn_returns_column('public.public_busy_intervals(uuid[], timestamptz, timestamptz)', 'starts_at'), 'public_busy_intervals() har starts_at');
select tt.ok(not tt.fn_returns_column('public.public_busy_intervals(uuid[], timestamptz, timestamptz)', 'lead_id')
         and not tt.fn_returns_column('public.public_busy_intervals(uuid[], timestamptz, timestamptz)', 'patient_id')
         and not tt.fn_returns_column('public.public_busy_intervals(uuid[], timestamptz, timestamptz)', 'status')
         and not tt.fn_returns_column('public.public_busy_intervals(uuid[], timestamptz, timestamptz)', 'id'), 'public_busy_intervals() har ingen id''er eller typer');
select tt.eq((select count(*) from public.public_busy_intervals(array[tt.cid('X')], now(), now() + interval '30 days'))::int, 2, 'booking og blokering hos X vises som optaget');
select tt.eq((select count(*) from public.public_busy_intervals(array[tt.cid('A6'), tt.cid('R'), tt.cid('I')], now(), now() + interval '30 days'))::int, 0,
             'optagede tider for ikke-verificerede klinikker vises ikke');

-- Anmeldelser: intet for ikke-verificerede
select tt.eq((select count(*) from public.public_reviews(tt.cid('I')))::int, 0, 'public_reviews(importeret) er tom');
select tt.eq((select count(*) from public.public_clinic_review_stats_many(array[tt.cid('I'), tt.cid('R')]))::int, 0, 'statistik for ikke-verificerede er tom');

rollback;
