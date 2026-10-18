-- Test 8: clinic_decide_lead afviser andre end ejeren af leadets klinik og en ikke-verificeret klinik; et declined eller
-- withdrawn lead kan ikke accepteres. Accept af et akut-lead inden for 30 minutter gør held til booked; afvisning frigiver
-- tiden, så en anden kan booke den. Accept efter udløb giver accepted uden booking.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'S_e1');   -- akut, accepteres inden for 30 min
select tt.mk_case('pA', 'S_e2');   -- akut, afvises
select tt.mk_case('pA', 'S_e3');   -- akut, udløber
select tt.mk_case('pB', 'S_comp'); -- konkurrerende patient
select tt.mk_case('pA', 'S_dec');
select tt.mk_case('pA', 'S_wd');
select tt.mk_case('pA', 'S_unv');

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select public.send_leads(tt.id('S_e1'), array[tt.cid('X')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('S_e2'), array[tt.cid('Y')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('S_e3'), array[tt.cid('Z')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('S_wd'), array[tt.cid('W')]);
select public.withdraw_lead(tt.lead('S_wd', 'W'));
select tt.as_postgres();
select tt.mk_lead('S_dec', 'X', 'declined');
select tt.mk_lead('S_unv', 'A6', 'sent');
select public.admin_set_clinic_status(tt.cid('A6'), 'registered');   -- klinikken mister sin verificering efter at have fået leadet

-- Ikke ejeren
select tt.as_user(tt.id('uY'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'accept'), 'en anden klinik kan ikke acceptere', 'NOT_FOUND');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'accept'), 'patienten kan ikke acceptere', 'NOT_FOUND');
select tt.as_anon();
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'accept'), 'anon kan ikke acceptere');
-- Ikke-verificeret klinik
select tt.as_user(tt.id('uA6'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S_unv', 'A6'), 'accept'), 'ikke-verificeret klinik kan ikke acceptere', 'CLINIC_NOT_VERIFIED');
-- declined og withdrawn kan ikke accepteres
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S_dec', 'X'), 'accept'), 'declined lead kan ikke accepteres', 'LEAD_NOT_PENDING');
select tt.as_user(tt.id('uW'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S_wd', 'W'), 'accept'), 'withdrawn lead kan ikke accepteres', 'LEAD_NOT_PENDING');
-- clinic_left kan ikke vælges af klinikken
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L, null, null, null, %L)', tt.lead('S', 'X'), 'decline', 'clinic_left'), 'clinic_left kan ikke vælges', 'INVALID_DECLINE_REASON');
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'decline'), 'afvisning kræver årsag', 'DECLINE_REASON_REQUIRED');

-- Normal accept og dobbeltbeslutning
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept', 'Velkommen', 600, 900);
select tt.eq(public.clinic_lead_status(tt.lead('S', 'X'))::text, 'accepted', 'normalt lead accepteret (set af klinikken)');
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'accept'), 'et accepteret lead kan ikke besluttes igen', 'LEAD_NOT_PENDING');

-- Akut: accept inden for 30 min gør held til booked
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), 'held', 'akuttid reserveret ved afsendelse');
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e1', 'X')), 'sent', 'akut-lead er sent, til klinikken svarer');
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S_e1', 'X'), 'accept');
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), 'booked', 'accept gør held til booked');
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e1', 'X')), 'booked', 'accept sætter leadet til booked');
select tt.eq((select b.hold_expires_at from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), null::timestamptz, 'hold_expires_at ryddes');

-- Akut: afvisning frigiver tiden
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S_e2', 'Y'), 'decline', null, null, null, 'no_capacity');
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e2', 'Y')), 'cancelled', 'afvisning aflyser reservationen');
select tt.eq((select b.cancelled_by::text from public.bookings b where b.lead_id = tt.lead('S_e2', 'Y')), 'clinic', 'cancelled_by = clinic');
select tt.mk_lead('S_comp', 'Y', 'accepted');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_comp', 'Y'), tt.svc('akut_konsultation'), tt.slot(3, 18), 'Bo Test', '+45 87654321'),
                  'en anden patient kan booke den frigivne tid');

-- Akut: accept efter udløb giver accepted uden booking
select tt.as_postgres();
update public.bookings set hold_expires_at = now() - interval '1 minute' where lead_id = tt.lead('S_e3', 'Z');
select tt.as_user(tt.id('uZ'));
select public.clinic_decide_lead(tt.lead('S_e3', 'Z'), 'accept');
select tt.as_postgres();
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e3', 'Z')), 'accepted', 'accept efter udløb giver accepted');
select tt.eq((select count(*) from public.bookings b where b.lead_id = tt.lead('S_e3', 'Z') and b.status in ('held', 'booked'))::int, 0, 'ingen aktiv booking efter udløbet accept');

rollback;
