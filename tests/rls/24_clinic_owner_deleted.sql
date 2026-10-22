-- Test 24: Når en verificeret kliniks ejer slettes: klinikken bliver imported, sent/accepted leads bliver declined med
-- clinic_left, held frigives, fremtidige booked aflyses, afholdte bookinger og anmeldelser består. En klinik kan ikke
-- selv sætte clinic_left via clinic_decide_lead().
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'L1');
select tt.mk_case('pA', 'L2');
select tt.mk_case('pA', 'L3');
select tt.mk_case('pA', 'L4');
select tt.mk_case('pA', 'L5');
select tt.mk_case('pA', 'L6');
select tt.mk_lead('L1', 'A1', 'sent');
select tt.mk_lead('L2', 'A1', 'accepted');
select tt.mk_booking(tt.mk_lead('L3', 'A1', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held');
select tt.mk_booking(tt.mk_lead('L4', 'A1', 'booked'), 'undersoegelse', tt.slot(4, 10), 'booked');
select tt.mk_booking(tt.mk_lead('L5', 'A1', 'booked'), 'undersoegelse', now() - interval '5 days', 'completed');
-- L6: lead hos en anden klinik (urørt)
select tt.mk_lead('L6', 'A2', 'sent');
-- En anmeldelse af den afholdte booking
select tt.as_user(tt.id('pA'));
insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy)
values (tt.booking(tt.lead('L5', 'A1')), tt.id('pA'), 4, 'Fin behandling, og prisen passede fint.', 'as_quoted');

-- En klinik kan ikke selv sætte clinic_left
select tt.as_user(tt.id('uA2'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L, null, null, null, %L)', tt.lead('L6', 'A2'), 'decline', 'clinic_left'),
                 'klinikken kan ikke selv sætte clinic_left', 'INVALID_DECLINE_REASON');
select tt.denied(format('update public.leads set status = %L, decline_reason = %L where id = %L', 'declined', 'clinic_left', tt.lead('L6', 'A2')),
                 'klinikken kan ikke opdatere leads direkte', '42501');

-- Ejerens konto slettes
select tt.as_postgres();
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'verified', 'før: klinikken er verificeret');
delete from auth.users where id = tt.id('uA1');

select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'imported', 'klinikken er nu importeret');
select tt.eq((select owner_id from public.clinics where id = tt.cid('A1')), null::uuid, 'ejeren er fjernet');
select tt.eq((select verified_at from public.clinics where id = tt.cid('A1')), null::timestamptz, 'verified_at er nulstillet');
select tt.eq((select count(*) from public.clinics where id = tt.cid('A1'))::int, 1, 'klinikken findes stadig (grunddata)');
select tt.eq((select status::text from public.leads where id = tt.lead('L1', 'A1')), 'declined', 'sent lead er declined');
select tt.eq((select decline_reason::text from public.leads where id = tt.lead('L1', 'A1')), 'clinic_left', 'sent lead: clinic_left');
select tt.ok((select responded_at is not null from public.leads where id = tt.lead('L1', 'A1')), 'responded_at er sat');
select tt.eq((select status::text from public.leads where id = tt.lead('L2', 'A1')), 'declined', 'accepted lead er declined');
select tt.eq((select decline_reason::text from public.leads where id = tt.lead('L2', 'A1')), 'clinic_left', 'accepted lead: clinic_left');
select tt.eq((select status::text from public.leads where id = tt.lead('L3', 'A1')), 'declined', 'lead med held er declined');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('L3', 'A1')), 'cancelled', 'held-reservationen er frigivet');
select tt.eq((select cancelled_by::text from public.bookings where lead_id = tt.lead('L3', 'A1')), 'clinic', 'cancelled_by = clinic (held)');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('L4', 'A1')), 'cancelled', 'fremtidig booking er aflyst');
select tt.eq((select cancelled_by::text from public.bookings where lead_id = tt.lead('L4', 'A1')), 'clinic', 'cancelled_by = clinic (booked)');
select tt.eq((select status::text from public.leads where id = tt.lead('L4', 'A1')), 'declined', 'lead med aflyst booking er declined');
select tt.eq((select decline_reason::text from public.leads where id = tt.lead('L4', 'A1')), 'clinic_left', 'lead med aflyst booking: clinic_left');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('L5', 'A1')), 'completed', 'afholdt booking består');
select tt.eq((select status::text from public.leads where id = tt.lead('L5', 'A1')), 'booked', 'lead med afholdt booking består');
select tt.eq((select count(*) from public.reviews where clinic_id = tt.cid('A1'))::int, 1, 'anmeldelsen består');
select tt.eq((select status::text from public.leads where id = tt.lead('L6', 'A2')), 'sent', 'andre klinikkers leads er urørt');

-- Klinikken er ikke længere tilgængelig for nye leads, og vises som importeret
select tt.mk_case('pB', 'L7');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('L7'), tt.cid('A1')), 'klinikken kan ikke modtage nye leads', 'CLINIC_NOT_AVAILABLE');
select tt.as_anon();
select tt.eq((select status::text from public.public_clinics(null, array[tt.cid('A1')])), 'imported', 'klinikken vises som imported offentligt');
select tt.eq((select prices from public.public_clinics(array[tt.svc('undersoegelse')], array[tt.cid('A1')])), null::jsonb, 'ingen priser for den nu importerede klinik');
select tt.eq((select count(*) from public.public_reviews(tt.cid('A1')))::int, 0, 'anmeldelser skjules, mens klinikken er importeret');

rollback;
