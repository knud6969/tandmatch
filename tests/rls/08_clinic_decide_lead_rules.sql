-- Test 8: clinic_decide_lead afviser andre end ejeren af leadets klinik og en ikke-verificeret klinik; et declined eller
-- withdrawn lead kan ikke accepteres. Et akut-lead accepteres kun med en foreslået tid (og et almindeligt aldrig med en): tiden
-- reserveres (held, uden kontakt for klinikken), og patienten bekræfter den inden for 30 minutter. En optaget eller lukket tid
-- afvises. Efter udløb kan forslaget ikke bekræftes, og patienten booker selv.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'S_e1');   -- akut, forslag bekræftes
select tt.mk_case('pA', 'S_e2');   -- akut, optaget tid og afvisning
select tt.mk_case('pA', 'S_e3');   -- akut, forslaget udløber
select tt.mk_case('pB', 'S_comp'); -- konkurrerende patient
select tt.mk_case('pA', 'S_dec');
select tt.mk_case('pA', 'S_wd');
select tt.mk_case('pA', 'S_unv');

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select public.send_leads(tt.id('S_e1'), array[tt.cid('X')], tt.svc('akut_konsultation'), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('S_e2'), array[tt.cid('Y')], tt.svc('akut_konsultation'), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('S_e3'), array[tt.cid('Z')], tt.svc('akut_konsultation'), 'Alma Test', '+45 12345678');
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

-- Et almindeligt lead kan ikke accepteres med en foreslået tid
select tt.denied(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('S', 'X'), 'accept', tt.slot(3, 10)),
                 'almindeligt lead kan ikke få en foreslået tid', 'PROPOSED_TIME_REQUIRED');

-- Normal accept og dobbeltbeslutning
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept', 'Velkommen', 600, 900);
select tt.eq(public.clinic_lead_status(tt.lead('S', 'X'))::text, 'accepted', 'normalt lead accepteret (set af klinikken)');
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S', 'X'), 'accept'), 'et accepteret lead kan ikke besluttes igen', 'LEAD_NOT_PENDING');

-- Akut: ingen booking ved afsendelse; kontakten ligger på leadet (kun patienten kan læse leads)
select tt.as_postgres();
select tt.eq((select count(*) from public.bookings b where b.lead_id = tt.lead('S_e1', 'X'))::int, 0, 'ingen booking ved afsendelse');
select tt.eq((select l.contact_phone from public.leads l where l.id = tt.lead('S_e1', 'X')), '+45 12345678', 'kontakten er gemt på leadet');

-- Akut: accept kræver en tid
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('S_e1', 'X'), 'accept'), 'akut-lead kræver en foreslået tid', 'PROPOSED_TIME_REQUIRED');
select tt.denied(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('S_e1', 'X'), 'accept', tt.slot(3, 21)),
                 'tid uden for åbningstid', 'SLOT_UNAVAILABLE');

-- Akut: accept med tid reserverer den; klinikken ser ingen kontakt, før patienten har bekræftet
select public.clinic_decide_lead(tt.lead('S_e1', 'X'), 'accept', 'Kom bare', p_proposed_starts_at => tt.slot(3, 18));
select tt.eq((select d.booking_status::text from public.clinic_lead_detail(tt.lead('S_e1', 'X')) d), 'held', 'forslaget er reserveret (held)');
select tt.eq((select d.contact_phone from public.clinic_lead_detail(tt.lead('S_e1', 'X')) d), null::text, 'ingen kontakt for klinikken, mens tiden er held');
select tt.as_postgres();
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e1', 'X')), 'accepted', 'leadet er accepteret');
select tt.ok((select b.hold_expires_at <= now() + interval '30 minutes' from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), 'reservationen gælder højst 30 minutter');
select tt.eq((select b.contact_phone from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), '+45 12345678', 'bookingen får kontakten fra leadet');

-- Kun patienten selv kan bekræfte (id'et slås op som postgres, så kaldene får det rigtige id)
select set_config('tt.held', (select b.id::text from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), true);
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.confirm_held_booking(%L)', current_setting('tt.held')), 'klinikken kan ikke bekræfte', 'NOT_FOUND');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.confirm_held_booking(%L)', current_setting('tt.held')), 'en anden patient kan ikke bekræfte', 'NOT_FOUND');
select tt.as_user(tt.id('pA'));
select public.confirm_held_booking(current_setting('tt.held')::uuid);
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), 'booked', 'bekræftelse gør held til booked');
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e1', 'X')), 'booked', 'bekræftelse sætter leadet til booked');
select tt.eq((select b.hold_expires_at from public.bookings b where b.lead_id = tt.lead('S_e1', 'X')), null::timestamptz, 'hold_expires_at ryddes');
select tt.as_user(tt.id('uX'));
select tt.eq((select d.contact_phone from public.clinic_lead_detail(tt.lead('S_e1', 'X')) d), '+45 12345678', 'klinikken ser kontakten efter bekræftelsen');

-- Akut: en optaget tid kan ikke foreslås; afvisning laver ingen booking
select tt.as_postgres();
select tt.mk_booking(tt.mk_lead('S_comp', 'Y', 'accepted'), 'akut_konsultation', tt.slot(3, 18));
select tt.as_user(tt.id('uY'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('S_e2', 'Y'), 'accept', tt.slot(3, 18)),
                 'en optaget tid kan ikke foreslås', 'SLOT_TAKEN');
select public.clinic_decide_lead(tt.lead('S_e2', 'Y'), 'decline', null, null, null, 'no_capacity');
select tt.as_postgres();
select tt.eq((select count(*) from public.bookings b where b.lead_id = tt.lead('S_e2', 'Y'))::int, 0, 'afvisning laver ingen booking');

-- Akut: et udløbet forslag kan ikke bekræftes; leadet forbliver accepteret, og patienten kan booke selv
select tt.as_user(tt.id('uZ'));
select public.clinic_decide_lead(tt.lead('S_e3', 'Z'), 'accept', p_proposed_starts_at => tt.slot(3, 18));
select tt.as_postgres();
update public.bookings set hold_expires_at = now() - interval '1 minute' where lead_id = tt.lead('S_e3', 'Z');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.confirm_held_booking(%L)', (select b.id from public.bookings b where b.lead_id = tt.lead('S_e3', 'Z'))), 'udløbet forslag kan ikke bekræftes', 'HOLD_EXPIRED');
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_e3', 'Z'), tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678'),
                  'patienten kan selv booke efter udløb');

rollback;
