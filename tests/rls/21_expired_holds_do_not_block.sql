-- Test 21: En held-akuttid ældre end 30 minutter (hold_expires_at i fortiden) blokerer ikke book_slot() for en anden
-- patient, vises ikke i public_busy_intervals() og har effektiv status cancelled, uden at complete_due_bookings() har kørt.
-- release_expired_holds() kan ikke kaldes af authenticated.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pB', 'SB_e');
select tt.mk_case('pA', 'S_x');
select tt.as_user(tt.id('pB'));
select public.send_leads(tt.id('SB_e'), array[tt.cid('X')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Bo Test', '+45 87654321');
select tt.as_postgres();
select tt.mk_lead('S_x', 'X', 'accepted');

-- Mens reservationen er frisk, er tiden optaget
select tt.as_anon();
select tt.eq((select count(*) from public.public_busy_intervals(array[tt.cid('X')], now(), now() + interval '30 days'))::int, 1, 'frisk reservation vises som optaget');

-- Reservationen udløber (simuleret)
select tt.as_postgres();
update public.bookings set hold_expires_at = now() - interval '5 minutes' where lead_id = tt.lead('SB_e', 'X');
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('SB_e', 'X')), 'held', 'databasestatus er stadig held (ingen oprydning har kørt)');

select tt.as_anon();
select tt.eq((select count(*) from public.public_busy_intervals(array[tt.cid('X')], now(), now() + interval '30 days'))::int, 0, 'udløbet reservation vises ikke i public_busy_intervals()');
select tt.as_user(tt.id('pB'));
select tt.eq(public.effective_booking_status(tt.booking(tt.lead('SB_e', 'X')))::text, 'cancelled', 'effektiv status er cancelled');
select tt.as_user(tt.id('uX'));
select tt.eq((select status::text from public.clinic_bookings(now(), now() + interval '30 days')), 'cancelled', 'clinic_bookings() viser effektiv status cancelled');
select tt.eq((select coalesce(contact_name, contact_phone, contact_email) from public.clinic_bookings(now(), now() + interval '30 days')), null::text, 'udløbet reservation viser ingen kontaktoplysninger');
select tt.eq((select booking_status::text from public.clinic_lead_detail(tt.lead('SB_e', 'X'))), 'cancelled', 'clinic_lead_detail() viser effektiv status cancelled');
select tt.eq((select contact_name from public.clinic_lead_detail(tt.lead('SB_e', 'X'))), null::text, 'clinic_lead_detail(): ingen kontakt på udløbet reservation');

-- release_expired_holds() kan ikke kaldes udefra
select tt.denied(format('select public.release_expired_holds(%L)', tt.cid('X')), 'klinik kan ikke kalde release_expired_holds()', '42501');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.release_expired_holds(%L)', tt.cid('X')), 'patient kan ikke kalde release_expired_holds()', '42501');
select tt.as_anon();
select tt.denied(format('select public.release_expired_holds(%L)', tt.cid('X')), 'anon kan ikke kalde release_expired_holds()', '42501');

-- En anden patient kan booke tiden
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_x', 'X'), tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678'),
                  'udløbet reservation blokerer ikke book_slot()');
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('SB_e', 'X')), 'cancelled', 'book_slot() frigav den udløbne reservation');
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_x', 'X')), 'booked', 'den nye booking er booked');

-- Samme for send_leads: en anden patient kan reservere den udløbne tid
select tt.mk_case('pB', 'SB_e2');
select tt.mk_case('pA', 'S_e2');
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S_e2'), array[tt.cid('Y')], tt.svc('akut_konsultation'), tt.slot(3, 19), 'Alma Test', '+45 12345678');
select tt.as_postgres();
update public.bookings set hold_expires_at = now() - interval '1 second' where lead_id = tt.lead('S_e2', 'Y');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.send_leads(%L, array[%L]::uuid[], %L, %L, %L, %L)', tt.id('SB_e2'), tt.cid('Y'), tt.svc('akut_konsultation'), tt.slot(3, 19), 'Bo Test', '+45 87654321'),
                  'udløbet reservation blokerer ikke send_leads()');

-- complete_due_bookings() er jobbet: kun service role, og det rydder resten
select tt.as_service();
select tt.allowed('select * from public.complete_due_bookings()', 'service role kan køre complete_due_bookings()');

rollback;
