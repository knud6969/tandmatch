-- Test 30 (security 0.7, L2, M3, M5, M6, L3): databasen selv kræver hele kvarterer på bookings.starts_at, også ved
-- skrivning som postgres/service role; effective_booking_status(uuid) findes ikke længere; patienter kan ikke slette
-- sager; ingen TRUNCATE/REFERENCES/TRIGGER for anon/authenticated; delingssamtykke trækker kun leads tilbage, hvis
-- der ikke findes et andet aktivt samtykke.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- L2
select tt.mk_case('pA', 'Q1');
select tt.mk_lead('Q1', 'X', 'booked');
select tt.denied(format($q$insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
                   values (%L, %L, %L, %L, %L, %L, 'booked', 'Alma Test', '+45 00 00 00 01', 'a@test.invalid')$q$,
                   tt.lead('Q1', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), tt.slot(3, 10, 7), tt.slot(3, 10, 37)),
                 'postgres kan ikke indsætte 10:07', 'bookings_starts_at_quarter');
select tt.denied(format($q$insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
                   values (%L, %L, %L, %L, %L, %L, 'booked', 'Alma Test', '+45 00 00 00 01', 'a@test.invalid')$q$,
                   tt.lead('Q1', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), tt.slot(3, 10, 15, 30), tt.slot(3, 10, 45)),
                 'postgres kan ikke indsætte 10:15:30', 'bookings_starts_at_quarter');
select tt.as_service();
select tt.denied(format($q$insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
                   values (%L, %L, %L, %L, %L, %L, 'booked', 'Alma Test', '+45 00 00 00 01', 'a@test.invalid')$q$,
                   tt.lead('Q1', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), tt.slot(3, 10, 14), tt.slot(3, 10, 44)),
                 'service role kan ikke indsætte 10:14', 'bookings_starts_at_quarter');
select tt.allowed(format($q$insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
                   values (%L, %L, %L, %L, %L, %L, 'booked', 'Alma Test', '+45 00 00 00 01', 'a@test.invalid')$q$,
                   tt.lead('Q1', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), tt.slot(3, 10, 45), tt.slot(3, 11, 15)),
                 'et helt kvarter lykkes');

-- M3
select tt.as_user(tt.id('pA'));
select tt.ok(to_regprocedure('public.effective_booking_status(uuid)') is null, 'effective_booking_status(uuid) findes ikke');

-- M5
select tt.as_postgres();
select tt.mk_case('pA', 'Draft1', p_approve => false);
select tt.as_user(tt.id('pA'));
select tt.affects(format('delete from public.cases where id = %L', tt.id('Draft1')), 0, 'patienten kan ikke slette en kladde');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('Draft1')), 1, 'kladden findes stadig');

-- M6
select tt.as_postgres();
select tt.eq((select count(*) from information_schema.role_table_grants
               where table_schema = 'public' and grantee in ('anon', 'authenticated')
                 and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER'))::int, 0, 'ingen TRUNCATE/REFERENCES/TRIGGER for anon/authenticated');
select tt.as_user(tt.id('pA'));
select tt.denied('truncate public.messages', 'authenticated kan ikke TRUNCATE messages', '42501');
select tt.as_anon();
select tt.denied('truncate public.clinics cascade', 'anon kan ikke TRUNCATE clinics', '42501');

-- L3: to aktive delingssamtykker; tilbagetrækning af det ene rører ikke leads
select tt.as_postgres();
insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
values (tt.id('pA'), 'health_data_sharing', 'health_data_sharing@v0-prototype', false);
select tt.mk_case('pA', 'L3a');
select tt.mk_lead('L3a', 'Y', 'sent');
select tt.as_user(tt.id('pA'));
select tt.eq((select consent_type::text from public.withdraw_consent((select id from public.consents where patient_id = tt.id('pA') and type = 'health_data_sharing' order by created_at limit 1))), 'health_data_sharing', 'det ene samtykke trækkes tilbage');
select tt.as_postgres();
select tt.eq((select status::text from public.leads where id = tt.lead('L3a', 'Y')), 'sent', 'leadet er uberørt, når et andet aktivt samtykke findes');
select tt.as_user(tt.id('pA'));
select tt.eq((select withdrawn_leads from public.withdraw_consent((select id from public.consents where patient_id = tt.id('pA') and type = 'health_data_sharing' and withdrawn_at is null))), 1, 'det sidste samtykke trækker leadet tilbage');
select tt.as_postgres();
select tt.eq((select status::text from public.leads where id = tt.lead('L3a', 'Y')), 'withdrawn', 'leadet er trukket tilbage');

rollback;
