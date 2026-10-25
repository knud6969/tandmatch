-- Test 54 (features/booking/README.md 4.3, 10.10; migration 20261101000100_booking_cancel_reason):
--  * cancel_booking(p_booking_id, p_reason): klinikken kan give en kort grund (trimmes, tom bliver null, over 200 tegn afvises);
--    patienten kan aflyse, men ikke give en grund. En anden klinik får NOT_FOUND.
--  * clinic_bookings()/clinic_booking() og patient_bookings() giver cancelled_by og cancel_reason, kun for aflyste bookinger.
--    En udløbet reservation har cancelled_by = null (vises som "system").
--  * Klientroller kan ikke skrive cancel_reason direkte, og en grund kan kun stå på en booking, klinikken har aflyst.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'C_clinic');
select tt.mk_case('pA', 'C_patient');
select tt.mk_case('pA', 'C_empty');
select tt.mk_case('pA', 'C_hold');
select tt.mk_booking(tt.mk_lead('C_clinic', 'X', 'booked'), 'undersoegelse', tt.slot(5, 10), 'booked');
select tt.mk_booking(tt.mk_lead('C_patient', 'X', 'booked'), 'undersoegelse', tt.slot(6, 10), 'booked');
select tt.mk_booking(tt.mk_lead('C_empty', 'X', 'booked'), 'undersoegelse', tt.slot(7, 10), 'booked');
select tt.mk_booking(tt.mk_lead('C_hold', 'X', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held', 30, now() - interval '1 minute');

select set_config('tt.b_clinic', tt.booking(tt.lead('C_clinic', 'X'))::text, true);
select set_config('tt.b_patient', tt.booking(tt.lead('C_patient', 'X'))::text, true);
select set_config('tt.b_empty', tt.booking(tt.lead('C_empty', 'X'))::text, true);
select set_config('tt.b_hold', tt.booking(tt.lead('C_hold', 'X'))::text, true);

-- Før aflysning: ingen cancelled_by eller grund.
select tt.as_user(tt.id('uX'));
select tt.eq((select cancelled_by::text from public.clinic_booking(current_setting('tt.b_clinic')::uuid)), null::text, 'booked: ingen cancelled_by');

-- En anden klinik kan ikke aflyse (heller ikke med grund).
select tt.as_user(tt.id('uY'));
select tt.denied(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_clinic'), 'Fremmed'), 'en anden klinik kan ikke aflyse', 'NOT_FOUND');

-- Klinikken: for lang grund afvises, og bookingen er urørt.
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_clinic'), repeat('x', 201)), 'grund over 200 tegn afvises', 'INVALID_REASON');
select tt.eq((select status::text from public.clinic_booking(current_setting('tt.b_clinic')::uuid)), 'booked', 'stadig booket efter afvist grund');
select tt.allowed(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_clinic'), '  Tandlægen er syg  '), 'klinikken aflyser med grund');
select tt.eq((select cancelled_by::text from public.clinic_booking(current_setting('tt.b_clinic')::uuid)), 'clinic', 'klinikken ser cancelled_by = clinic');
select tt.eq((select cancel_reason from public.clinic_booking(current_setting('tt.b_clinic')::uuid)), 'Tandlægen er syg', 'klinikken ser den trimmede grund');
select tt.eq((select count(*) from public.clinic_bookings(now(), now() + interval '30 days') where cancel_reason = 'Tandlægen er syg')::int, 1, 'clinic_bookings har grunden');
select tt.eq((select coalesce(contact_name, contact_phone, contact_email) from public.clinic_booking(current_setting('tt.b_clinic')::uuid)), null::text, 'aflyst: ingen kontakt');
-- Tom grund gemmes som null.
select tt.allowed(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_empty'), '   '), 'klinikken aflyser med tom grund');
select tt.eq((select cancel_reason from public.clinic_booking(current_setting('tt.b_empty')::uuid)), null::text, 'tom grund bliver null');

-- Patienten: ser klinikkens grund; kan aflyse, men ikke give en grund.
select tt.as_user(tt.id('pA'));
select tt.eq((select cancel_reason from public.patient_bookings(current_setting('tt.b_clinic')::uuid)), 'Tandlægen er syg', 'patienten ser klinikkens grund');
select tt.eq((select cancelled_by::text from public.patient_bookings(current_setting('tt.b_clinic')::uuid)), 'clinic', 'patienten ser cancelled_by = clinic');
select tt.eq((select cancel_reason from public.bookings where id = current_setting('tt.b_clinic')::uuid), 'Tandlægen er syg', 'patienten læser grunden i egen række (SELECT-policy)');
select tt.denied(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_patient'), 'Jeg kan ikke'), 'patienten kan ikke give en grund', 'INVALID_REASON');
select tt.allowed(format('select public.cancel_booking(%L::uuid)', current_setting('tt.b_patient')), 'patienten aflyser uden grund');
select tt.eq((select cancelled_by::text from public.patient_bookings(current_setting('tt.b_patient')::uuid)), 'patient', 'cancelled_by = patient');
select tt.eq((select cancel_reason from public.patient_bookings(current_setting('tt.b_patient')::uuid)), null::text, 'ingen grund ved patientens aflysning');
-- Udløbet reservation: effektivt aflyst, cancelled_by null.
select tt.eq((select status::text from public.patient_bookings(current_setting('tt.b_hold')::uuid)), 'cancelled', 'udløbet reservation er aflyst');
select tt.eq((select cancelled_by::text from public.patient_bookings(current_setting('tt.b_hold')::uuid)), null::text, 'udløbet reservation: cancelled_by null');
-- Ingen direkte skrivning.
select tt.denied(format('update public.bookings set cancel_reason = %L where id = %L::uuid', 'Hack', current_setting('tt.b_patient')), 'patienten kan ikke skrive cancel_reason', '42501');

-- Klinikken ser patientens aflysning, men en anden patient ser intet.
select tt.as_user(tt.id('uX'));
select tt.eq((select cancelled_by::text from public.clinic_booking(current_setting('tt.b_patient')::uuid)), 'patient', 'klinikken ser cancelled_by = patient');
select tt.denied(format('update public.bookings set cancel_reason = %L where id = %L::uuid', 'Hack', current_setting('tt.b_clinic')), 'klinikken kan ikke skrive direkte', '42501');
select tt.as_user(tt.id('pB'));
select tt.eq((select count(*) from public.patient_bookings(current_setting('tt.b_clinic')::uuid))::int, 0, 'en anden patient ser ikke bookingen');
select tt.as_anon();
select tt.denied(format('select public.cancel_booking(%L::uuid, %L)', current_setting('tt.b_clinic'), 'x'), 'anonyme kan ikke kalde cancel_booking', '42501');

-- Databasens regel: en grund kun på en booking, klinikken har aflyst.
select tt.as_postgres();
select tt.denied(format('update public.bookings set cancel_reason = %L where id = %L::uuid', 'x', current_setting('tt.b_patient')), 'grund på patientens aflysning afvises af check', 'bookings_cancel_reason_only_clinic');

rollback;
