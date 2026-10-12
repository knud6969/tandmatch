-- Test 3: Patient A kan ikke læse patient B's sager, ydelser, AI-samtaler, billeder, samtykker, leads, bookinger,
-- beskeder eller anmeldelser.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- B's materiale: lead hos X, accepteret og booket, besked, gennemført booking med anmeldelse
select tt.as_user(tt.id('pB'));
select public.send_leads(tt.id('SB'), array[tt.cid('X')]);
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('SB', 'X'), 'accept');
select tt.as_user(tt.id('pB'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('SB', 'X'), tt.id('pB'), 'B skriver til X');
select public.book_slot(tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Bo Test', '+45 87654321');
select tt.as_postgres();
select tt.mk_case('pB', 'SB2');
select tt.mk_booking(tt.mk_lead('SB2', 'Y', 'booked'), 'undersoegelse', now() - interval '3 days');
select tt.as_user(tt.id('pB'));
insert into public.reviews (booking_id, stars, text, price_accuracy)
select b.id, 5, 'Meget fin behandling og klar kommunikation.', 'as_quoted' from public.bookings b where b.lead_id = tt.lead('SB2', 'Y');
select tt.eq((select count(*) from public.reviews)::int, 1, 'opsætning: B har en anmeldelse');

-- A
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.cases where patient_id = ' || quote_literal(tt.id('pB')), 0, 'A kan ikke læse B''s sager');
select tt.rows('select 1 from public.cases', 1, 'A ser kun sin egen sag');
select tt.rows(format('select 1 from public.case_services where case_id in (%L, %L)', tt.id('SB'), tt.id('SB2')), 0, 'A kan ikke læse B''s ydelser');
select tt.rows(format('select 1 from public.ai_conversations where patient_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s AI-samtaler');
select tt.rows(format('select 1 from public.ai_messages where patient_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s AI-beskeder');
select tt.rows(format('select 1 from public.case_images where patient_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s billeder');
select tt.rows(format('select 1 from public.consents where patient_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s samtykker');
select tt.rows(format('select 1 from public.leads where case_id in (%L, %L)', tt.id('SB'), tt.id('SB2')), 0, 'A kan ikke læse B''s leads');
select tt.rows(format('select 1 from public.bookings where patient_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s bookinger');
select tt.rows('select 1 from public.messages', 0, 'A kan ikke læse B''s beskeder');
select tt.rows('select 1 from public.reviews', 0, 'A kan ikke læse B''s anmeldelser');
select tt.rows(format('select 1 from public.patients where id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s patientrække');
select tt.rows(format('select 1 from public.profiles where id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s profil');

-- Skrivning på B's data rammer 0 rækker eller afvises
select tt.affects(format('update public.cases set postal_code = %L where id = %L', '2200', tt.id('SB')), 0, 'A kan ikke opdatere B''s sag');
select tt.affects(format('delete from public.cases where id = %L', tt.id('SB')), 0, 'A kan ikke slette B''s sag');
select tt.denied(format('insert into public.case_services (case_id, service_id) values (%L, %L)', tt.id('SB'), tt.svc('tandrensning')), 'A kan ikke tilføje ydelse til B''s sag');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('SB', 'X'), tt.id('pA'), 'x'), 'A kan ikke skrive i B''s tråd');
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('SB', 'X')), 'A kan ikke trække B''s lead tilbage', 'NOT_FOUND');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(4, 10), 'Alma Test', '+45 12345678'),
                 'A kan ikke booke på B''s lead', 'NOT_FOUND');
select tt.denied(format('select public.cancel_booking(%L)', tt.booking(tt.lead('SB', 'X'))), 'A kan ikke aflyse B''s booking', 'NOT_FOUND');
select tt.denied(format('select public.close_case(%L)', tt.id('SB')), 'A kan ikke lukke B''s sag', 'NOT_FOUND');
select tt.denied(format('select public.withdraw_consent(%L)', tt.consent('pB', 'image_upload')), 'A kan ikke trække B''s samtykke tilbage', 'NOT_FOUND');

rollback;
