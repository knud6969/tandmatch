-- Test 47 (arbejdsplan 6.1, architecture 5.3, 5.5, 10.10):
--  * patient_bookings() giver kun patientens egne bookinger (effektiv status, klinikkens navn/adresse/by, reviewed), også fra en
--    fjernet klinik; en anden patient, en klinik og anonyme får ingen rækker eller afvises.
--  * clinic_booking() giver kun klinikkens egen booking, med kontaktfelter kun ved booked/completed (aldrig held), og en anden
--    klinik og patienten får ingen række.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'B_booked');
select tt.mk_case('pA', 'B_held');
select tt.mk_case('pA', 'B_done');
select tt.mk_case('pA', 'B_eff');
select tt.mk_booking(tt.mk_lead('B_booked', 'X', 'booked'), 'undersoegelse', tt.slot(5, 10), 'booked');
select tt.mk_booking(tt.mk_lead('B_held', 'X', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held');
select tt.mk_booking(tt.mk_lead('B_done', 'X', 'booked'), 'undersoegelse', now() - interval '6 days', 'completed');
select tt.mk_booking(tt.mk_lead('B_eff', 'X', 'booked'), 'undersoegelse', now() - interval '3 days', 'booked');

-- Patienten
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.patient_bookings())::int, 4, 'patienten ser sine 4 bookinger');
select tt.eq((select clinic_id from public.patient_bookings() where lead_id = tt.lead('B_booked', 'X')), tt.cid('X'), 'klinik-id følger bookingen');
select tt.ok((select clinic_name || clinic_address || clinic_city from public.patient_bookings() where lead_id = tt.lead('B_booked', 'X')) is not null, 'klinikkens navn, adresse og by udfyldt');
select tt.eq((select status::text from public.patient_bookings() where lead_id = tt.lead('B_eff', 'X')), 'completed', 'effektiv status: gennemført');
select tt.eq((select status::text from public.patient_bookings() where lead_id = tt.lead('B_held', 'X')), 'held', 'held vises som held');
select tt.ok((select hold_expires_at from public.patient_bookings() where lead_id = tt.lead('B_held', 'X')) is not null, 'held har hold_expires_at');
select tt.ok((select hold_expires_at from public.patient_bookings() where lead_id = tt.lead('B_booked', 'X')) is null, 'booked har ikke hold_expires_at');
select tt.eq((select reviewed from public.patient_bookings() where lead_id = tt.lead('B_done', 'X')), false, 'ingen anmeldelse endnu');
select tt.eq((select count(*) from public.patient_bookings((select booking_id from public.patient_bookings() where lead_id = tt.lead('B_done', 'X'))))::int, 1, 'opslag på id giver én række');

-- Andre
select tt.as_user(tt.id('pB'));
select tt.eq((select count(*) from public.patient_bookings())::int, 0, 'en anden patient ser ingen bookinger');
select tt.as_postgres();
select set_config('tt.bid', (select id::text from public.bookings where lead_id = tt.lead('B_booked', 'X')), true);
select tt.as_user(tt.id('pB'));
select tt.eq((select count(*) from public.patient_bookings(current_setting('tt.bid')::uuid))::int, 0, 'en anden patient får ingen række på fremmed id');
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.patient_bookings())::int, 0, 'klinikken ser ingen via patient_bookings');
select tt.as_anon();
select tt.denied('select * from public.patient_bookings()', 'anonyme kan ikke kalde patient_bookings', '42501');
select tt.denied('select * from public.clinic_booking(gen_random_uuid())', 'anonyme kan ikke kalde clinic_booking', '42501');

-- Klinikken
select tt.as_user(tt.id('uX'));
select tt.eq((select contact_name from public.clinic_booking(current_setting('tt.bid')::uuid)), 'Alma Test', 'booked: kontakt synlig');
select tt.eq((select can_mark_no_show from public.clinic_booking(current_setting('tt.bid')::uuid)), false, 'fremtidig booking: ikke no-show endnu');
select tt.as_postgres();
select set_config('tt.hid', (select id::text from public.bookings where lead_id = tt.lead('B_held', 'X')), true);
select tt.as_user(tt.id('uX'));
select tt.eq((select status::text from public.clinic_booking(current_setting('tt.hid')::uuid)), 'held', 'held vises');
select tt.eq((select coalesce(contact_name, contact_phone, contact_email) from public.clinic_booking(current_setting('tt.hid')::uuid)), null::text, 'held: ingen kontakt');
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_booking(current_setting('tt.bid')::uuid))::int, 0, 'en anden klinik får ingen række');
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.clinic_booking(current_setting('tt.bid')::uuid))::int, 0, 'patienten får ingen række fra clinic_booking');

rollback;
